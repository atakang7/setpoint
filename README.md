# Setpoint

Setpoint runs an ACP coding agent against a fixed target and checks its output with fresh evaluators.

```text
+----------------------+
| SetpointEngine       |
+----------------------+
           |
         prompts
           v
+----------------------+
| AcpCodingAgent       |
+----------------------+
           |
         edits
           v
+----------------------+
| target project       |
+----------------------+
           |
        observed
           v
+----------------------+
| BrowserObserver      |
| or CommandObserver   |
+----------------------+
           |
        evidence
           v
+----------------------+
| StructuredModel      |
+----------------------+
```

## Run

Node.js 22.12.0 is pinned in `.nvmrc`; the ACP agent must be installed and authenticated separately.

```sh
git clone https://github.com/atakang7/setpoint.git
cd setpoint
npm ci
npm run build
npm link
npx playwright install chromium

cd /path/to/target-project
setpoint init
```

Edit `setpoint.yaml` for the target project, then run:

```sh
setpoint doctor
setpoint run
setpoint inspect
setpoint ui
```

## Config

| var                        | default                 | what                                                 |
| -------------------------- | ----------------------- | ---------------------------------------------------- |
| `agent.command`            | `npx`                   | ACP executable                                       |
| `agent.args`               | Claude ACP package      | Arguments passed to the executable                   |
| `agent.permissions`        | `auto-allow`            | Coder tool approvals                                 |
| `models.provider`          | `agent`                 | ACP evaluators; `openai` is optional                 |
| `models.permissions`       | `deny`                  | Evaluator tool approvals                             |
| `observer.type`            | `browser`               | `browser` or `command`                               |
| `observer.url`             | `http://localhost:3000` | Target URL for browser capture                       |
| `observer.start_command`   | `npm run dev`           | Target's server command                              |
| `autopilot.max_iterations` | `20`                    | Maximum coder turns                                  |
| `run_dir`                  | `.setpoint`             | Saved runs                                           |
| `OPENAI_API_KEY`           | unset                   | Required only for OpenAI evaluators; export in shell |

Set `observer.command` instead of `observer.url` and `observer.start_command` when `observer.type: command`; see [Cortex](docs/cortex.md) for a different ACP agent.

## CI

```text
      +----------------+
      | push / PR      |
      +----------------+
              |
           triggers
              v
      +----------------+
      | CI workflow    |
      +----------------+
          |        |
        runs      runs
          v        v
+--------------+  +----------------+
| check        |  | dashboard-e2e  |
| Node 22 / 24 |  | Chromium       |
+--------------+  +----------------+
```

Verify locally with `npm run check` after `npm ci` and `npx playwright install chromium`.

## Limits

- `agent.permissions: auto-allow` can execute commands and modify files; use an isolated workspace.
- Each `setpoint run` starts a new run, not a resumed ACP session.
- Browser and command observations cannot prove every requirement.
- `setpoint ui` is read-only and listens on `127.0.0.1:3210` by default; see [inspection](docs/observability.md).
- The engine's phase and session rules are in [architecture](docs/architecture.md).
