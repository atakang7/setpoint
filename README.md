# Setpoint

**Outcome control for coding agents.**

Setpoint is a small open-source wrapper that keeps a coding agent working until the **observable product** reaches a developer-defined North Star.

Coding agents are good at producing code. They are much less reliable at deciding when the thing they produced is actually *done*. Setpoint moves that decision out of the worker loop.

```text
Developer intent
      ↓
North Star Definer   ← strongest model, once
      ↓
Persistent ACP coding-agent session
      ↓ agent stops
Observer             ← browser screenshots / command behavior
      ↓
Progress Judge       ← CONTINUE or FINAL_CANDIDATE
      ↓                     ↓
   resume coder          3 fresh jurors
                              ↓
                       PASS or resume coder
```

The invariant is deliberately simple:

> **Setpoint evaluates what was produced, not how it was produced.**

It does not care whether the worker used React, Svelte, a terrible abstraction, or a beautiful one. If the observable result reaches the North Star, it passes. If it does not, the worker keeps going.

## Why this exists

A large amount of developer time with coding agents is still spent saying some variation of:

- "yes, continue"
- "this is technically done but it still looks bad"
- "that is not what I meant"
- "stop adding random things and make the actual product better"

Setpoint turns that feedback loop into an autopilot.

## North Star, not a spec

The developer writes intent like a developer:

```yaml
task: >
  Build a premium launch experience for this product. It should feel like a
  serious Apple/Microsoft launch, not a generic AI landing page.
```

A strong model runs once and compiles that into a frozen North Star such as:

```json
{
  "vision": "A confident product launch experience where the product itself carries the story.",
  "experience": [
    "The product feels important immediately.",
    "The experience progresses deliberately rather than feeling like unrelated sections.",
    "Motion communicates capability instead of decorating the page."
  ],
  "quality_bar": "Would not look out of place on the launch page of a serious, well-funded developer product.",
  "avoid": [
    "generic AI landing-page aesthetics",
    "meaningless floating objects",
    "template-like feature-card repetition"
  ],
  "guidance": {
    "reasoning": "High-quality motion is easier to control with a mature sequencing tool than raw ad-hoc CSS.",
    "recommendations": ["Consider a timeline-based motion library and inspect actual renders."],
    "strength": "strong"
  }
}
```

`guidance` is expert leverage, **not a requirement**. A coder may ignore every recommendation and still pass if the observable result is excellent.

## Core behavior

1. **Define once.** A strong model creates the frozen North Star.
2. **Work persistently.** Setpoint starts an ACP coding-agent session and gives it the developer intent, North Star, and optional guidance.
3. **Observe reality.** When the coding agent stops, Setpoint captures the product itself.
4. **Judge the gap.** The progress judge sees the North Star and current observable result, not the source code.
5. **Push again.** If the result is not there, Setpoint sends concise direction back into the same coding-agent session.
6. **Require a jury.** A progress judge can never pass a run. It can only nominate a `FINAL_CANDIDATE`.
7. **Fresh final judgment.** Independent jurors see only the original intent, frozen North Star, and candidate product. They do not see coder claims or previous judge opinions.

By default, the final jury must be unanimous.

## ACP first

Setpoint uses the stable **Agent Client Protocol (ACP)** for the worker boundary. The coding agent is a replaceable actuator; Setpoint owns the mission and run state.

Current ACP adapters include:

- Claude Agent: `@agentclientprotocol/claude-agent-acp`
- Codex: `@agentclientprotocol/codex-acp`

Any stdio ACP agent can be used by changing `agent.command` and `agent.args`.

## Requirements

- Node.js 22.12+
- An ACP coding-agent command
- `OPENAI_API_KEY` for the built-in model provider
- Chromium for browser observation (`npx playwright install chromium`)

## Install from source

The repository starts at `0.1.0`; until an npm release exists, install it from source:

```bash
git clone https://github.com/atakang7/setpoint.git
cd setpoint
npm install
npm run build
npm link
npx playwright install chromium
```

Then in the project you want Setpoint to control:

```bash
setpoint init
setpoint doctor
setpoint run
```

## Minimal configuration

```yaml
version: 1

task: >
  Build a premium launch experience for this product. It should feel like a
  serious Apple/Microsoft launch, not a generic AI landing page.

agent:
  protocol: acp
  command: npx
  args: ["@agentclientprotocol/claude-agent-acp"]
  permissions: auto-allow

models:
  provider: openai
  api_key_env: OPENAI_API_KEY
  ideal_definer: gpt-5.6-sol
  judge: gpt-5.6-terra
  jury: [gpt-5.6-sol, gpt-5.6-sol, gpt-5.6-sol]

observer:
  type: browser
  url: http://localhost:3000
  start_command: npm run dev

autopilot:
  max_iterations: 20
  require_unanimous_jury: true
```

## Prompt control

Setpoint ships strong role prompts, but prompt personality is first-class configuration. User text is appended to non-overridable Setpoint invariants, so users can make a judge harsher without accidentally deleting the core contract.

```yaml
prompts:
  ideal_definer: |
    Be ambitious. Find the middle ground between vague taste and spec writing.

  coder: |
    Work aggressively. Do not stop at technically complete.

  judge: |
    Be ruthless about visible quality. Do not reward effort.

  jury: |
    Pass only if another iteration would be polish rather than repair.
```

The non-overridable rules include:

- observable outcome beats implementation details
- the North Star cannot move toward the current output
- the coder's claim of completion is not evidence
- guidance is advisory, not part of the pass criteria
- only the fresh jury can issue `PASS`

## Observers

### Browser

The browser observer starts an optional development command, waits for the configured URL, then captures multiple viewports with Playwright. Screenshots are passed directly to vision-capable judges.

```yaml
observer:
  type: browser
  url: http://localhost:3000
  start_command: npm run dev
  full_page: true
  viewports:
    - { width: 1440, height: 1000 }
    - { width: 390, height: 844 }
```

### Command

For CLIs, APIs, test harnesses, render commands, or any non-browser product, Setpoint can judge observable command output.

```yaml
observer:
  type: command
  command: npm run demo
  timeout_ms: 60000
```

The observer interface is intentionally tiny, so video, desktop-app, game, and richer interaction observers can be added without changing the engine.

## Run state

Setpoint owns the run, not the coding-agent conversation.

```text
.setpoint/
  latest
  runs/
    <run-id>/
      run.json
      north-star.json
      turns/
      observations/
      judgments/
      jury/
      observation-001/
      observation-002/
      ...
```

A run survives as a coherent record even if the worker implementation changes later.

## CLI

```bash
setpoint init                 # create setpoint.yaml
setpoint doctor               # validate local prerequisites
setpoint run                  # start autopilot
setpoint inspect              # inspect latest run state
setpoint --version
```

## Safety note

`agent.permissions: auto-allow` is designed for autonomous coding runs and may approve tool requests offered by the ACP agent. Run Setpoint in a repository, sandbox, container, VM, or account boundary appropriate for the code being executed. Use `permissions: deny` when you want the ACP agent's permission requests rejected.

## Design principles

- **Outcome over implementation.** Code is a means, not the evaluation target.
- **North Star over spec.** Define the finished reality without turning the developer into a PM writing acceptance criteria.
- **Strong intelligence at the high-leverage point.** Spend the best model on defining "good" once; use cheaper models where repetition dominates.
- **Persistent worker, fresh judges.** Implementation context should persist. Evaluation context should stay clean.
- **Frozen destination.** The target never becomes easier because the worker produced something mediocre.
- **Few knobs.** Great defaults, explicit overrides, no workflow DSL.

## Development

```bash
npm install
npm run check
```

CI runs formatting, linting, tests, and TypeScript build on supported Node versions. Releases are managed with Release Please and semantic versioning.

See [docs/architecture.md](docs/architecture.md) for the state machine and extension boundaries.

## License

MIT
