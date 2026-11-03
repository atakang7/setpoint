# Setpoint

Setpoint runs a coding agent against a fixed target and checks its output with browser screenshots or a command. When a check fails, it sends feedback to the same coding session for another attempt.

## Quick start

Use Node.js 22.12.0 (see `.nvmrc`) or a newer supported version, npm, and an authenticated ACP agent. Chromium is required for browser observation.

```sh
git clone https://github.com/atakang7/setpoint.git
cd setpoint
npm ci
npm run build
npm link
npx playwright install chromium
```

In the project the agent should work on:

```sh
cd /path/to/your-project
setpoint init
# Edit setpoint.yaml for this project before running.
setpoint doctor
setpoint run
```

`setpoint init` writes `setpoint.yaml` only when it does not exist. `doctor` checks the configured command and, for browser observation, the Chromium installation. It does not validate agent authentication.

## Configuration

The default file uses an ACP agent for coding and evaluation. Replace `task` and the agent command as needed:

```yaml
version: 1
task: >
  Make the home page render correctly at desktop and mobile widths.

agent:
  protocol: acp
  command: npx
  args: ["@agentclientprotocol/claude-agent-acp"]
  permissions: auto-allow

models:
  provider: agent
  permissions: deny

observer:
  type: browser
  url: http://127.0.0.1:3000
  start_command: npm run dev
  ready_timeout_ms: 60000
  viewports:
    - { width: 1440, height: 1000 }
    - { width: 390, height: 844 }

autopilot:
  max_iterations: 20
  require_unanimous_jury: true
```

The browser URL and start command must match the target project. For a CLI or a testable command, replace the observer section with:

```yaml
observer:
  type: command
  command: npm test
  timeout_ms: 60000
```

By default the reasoning roles reuse the configured ACP executable in separate sessions. `models.profiles` can override its command, arguments, environment, or permissions per role. For the optional OpenAI evaluator, set `models.provider: openai` and export `OPENAI_API_KEY` in your shell. `.env.example` lists that variable; Setpoint does not load `.env` files.

## How it works

Setpoint defines a target once, then opens a coding session. After each coding turn, the observer captures evidence and a new judge session returns either `CONTINUE` or `FINAL_CANDIDATE`. Final candidates go to independent jury sessions. A failed jury returns its feedback to the existing coding session.

Runs are written under `.setpoint/runs/<run-id>/`, with `.setpoint/latest` pointing to the latest run. Each run retains its target, observations, judgments, and verdicts.

## Usage

```sh
setpoint inspect
setpoint inspect --watch
setpoint inspect --json
setpoint ui
setpoint ui --host 127.0.0.1 --port 3210 --no-open
```

The inspector and dashboard read stored run data; they do not control the agent. The UI listens on localhost by default. Binding to another interface can expose screenshots and run details to the network.

## Limits and safety

An ACP-compatible command and its authentication must be set up separately. Setpoint does not install or authenticate the agent. Each `run` starts a new run; it does not resume a previous ACP session. Screenshots and command output provide evidence, not a guarantee of correctness.

`agent.permissions: auto-allow` may permit the worker to execute commands and change files. Run against a disposable checkout or inside a suitable sandbox. Evaluator sessions default to `permissions: deny`.

## Development

```sh
npm ci
npx playwright install chromium
npm run check
```

`npm run check` runs Prettier, ESLint, Vitest, and TypeScript. CI also runs a Chromium dashboard check. See [architecture](docs/architecture.md) and [run inspection](docs/observability.md) for implementation details.

MIT license.
