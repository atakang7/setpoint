# Setpoint

**Outcome control for coding agents.**

Setpoint is a small open-source wrapper that keeps a coding agent working until the **observable product** reaches a developer-defined North Star.

```text
Developer intent
      ↓
North Star Definer      fresh standalone agent session
      ↓
Persistent coding-agent session
      ↓ agent stops
Observer                browser / command / product state
      ↓
Progress Judge          fresh standalone agent session
      ↓                     ↓
   CONTINUE           FINAL_CANDIDATE
      │                     ↓
      └── same coder      fresh jurors
                              ↓
                       PASS or same coder
```

> **Setpoint evaluates what was produced, not how it was produced.**

The coding agent is a replaceable worker. Setpoint owns the destination, the observation loop, and the decision to stop.

## Why

A surprising amount of coding-agent supervision is still a developer repeatedly saying:

- "continue"
- "technically done, but still bad"
- "that is not what I meant"
- "stop adding random things and improve the actual product"

Setpoint turns that loop into autopilot.

## North Star, not a spec

The developer writes intent like a developer:

```yaml
task: >
  Build a premium launch experience for this product. It should feel like a
  serious Apple/Microsoft launch, not a generic AI landing page.
```

A strong standalone agent runs once and defines the finished reality: its character, experience, quality bar, visible failure modes, and optional expert guidance. It does **not** turn the request into Jira tickets or implementation requirements.

Guidance may recommend a library, rendering strategy, or implementation direction when that materially raises the worker's odds of success. Guidance is advice, never part of the pass criteria.

## Session topology

Setpoint is intentionally built around agent sessions:

| Role               | Session lifecycle                |
| ------------------ | -------------------------------- |
| North Star Definer | fresh, once                      |
| Coder              | **persistent for the whole run** |
| Progress Judge     | fresh on every coder stop        |
| Final Jurors       | fresh and independent            |

The same ACP agent can back every role by default. Users can override reasoning profiles to use a stronger or different standalone agent for the Definer, Judge, or Jury.

This means **no separate LLM API key is required on the default path**. If your coding agent is already authenticated, Setpoint can orchestrate standalone sessions of it.

An OpenAI API-backed structured model remains supported as an optional adapter.

## ACP first

Setpoint uses the stable **Agent Client Protocol (ACP)** as its preferred session boundary.

Any stdio ACP agent can be configured through `command` + `args`. Non-ACP terminal agents can be supported later through a PTY adapter without changing the Setpoint state machine.

## Requirements

- Node.js 22.12+
- an authenticated ACP-compatible agent command
- Chromium for browser observation (`npx playwright install chromium`)

## Install from source

```bash
git clone https://github.com/atakang7/setpoint.git
cd setpoint
npm install
npm run build
npm link
npx playwright install chromium
```

Then inside the project you want Setpoint to control:

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

# Fresh standalone sessions for Definer, Judge, and Jury.
# By default these inherit the coding agent command + args above.
models:
  provider: agent
  permissions: deny
  ideal_definer: default
  judge: default
  jury: [default, default, default]

observer:
  type: browser
  url: http://localhost:3000
  start_command: npm run dev
  full_page: true
  viewports:
    - { width: 1440, height: 1000 }
    - { width: 390, height: 844 }

autopilot:
  max_iterations: 20
  require_unanimous_jury: true
```

## Stronger/different reasoning agents

Reasoning profiles override the default standalone agent runtime. The exact command/arguments are agent-specific; Setpoint does not hard-code model names.

```yaml
models:
  provider: agent
  permissions: deny
  ideal_definer: strong
  judge: strong
  jury: [strong, strong, strong]

  profiles:
    strong:
      command: my-acp-agent
      args: ["--some-agent-specific-model-option", "strong-model"]
```

A profile can override `command`, `args`, `env`, or `permissions`. Missing fields inherit from the main coding-agent configuration.

## Optional API provider

If someone explicitly prefers API-backed evaluators, the previous OpenAI path remains available:

```yaml
models:
  provider: openai
  api_key_env: OPENAI_API_KEY
  ideal_definer: gpt-5.6-sol
  judge: gpt-5.6-terra
  jury: [gpt-5.6-sol, gpt-5.6-sol, gpt-5.6-sol]
```

This is optional, not the Setpoint default architecture.

## Prompt control

Prompts are first-class configuration, but Setpoint appends them to non-overridable invariants so a user can make a judge harsher without deleting the outcome-control contract.

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

Core invariants include:

- observable outcome beats implementation details
- the North Star never moves toward a mediocre current result
- coder claims of completion are not evidence
- guidance is advisory
- the progress judge cannot issue PASS
- final jurors are fresh and independent

## Observers

### Browser

The browser observer starts an optional dev command, waits for the configured URL, captures multiple viewports with Playwright, and exposes those artifacts to the judging session.

### Command

For CLIs, APIs, render commands, test harnesses, or other non-browser products:

```yaml
observer:
  type: command
  command: npm run demo
  timeout_ms: 60000
```

## State

Setpoint owns the run, not the coding-agent conversation:

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
```

A failed jury returns consolidated visible criticism to the **same persistent coder session**. A new progress judgment is made by a **new standalone judge session**.

## CLI

```bash
setpoint init
setpoint doctor
setpoint run
setpoint inspect
setpoint --version
```

## Safety

`agent.permissions: auto-allow` is intended for autonomous coding and can approve mutation/tool requests from the coding worker. Run Setpoint inside an appropriate repository, sandbox, container, VM, or account boundary.

Reasoning sessions default to `permissions: deny`: judges should inspect reality, not secretly fix it themselves.

## Design principles

- **Outcome over implementation.**
- **North Star over specification bureaucracy.**
- **Best intelligence at the highest-leverage decision point.**
- **Persistent worker, fresh evaluators.**
- **Frozen destination.**
- **Few knobs and strong defaults.**

## Development

```bash
npm install
npm run check
```

CI covers formatting, linting, tests, and TypeScript builds. Releases use semantic versioning / Release Please.

See [docs/architecture.md](docs/architecture.md) for the state machine and extension boundaries.

## License

MIT
