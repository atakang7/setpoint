Part of [setpoint](../../README.md).

# ACP agent

`AcpCodingAgent` starts a stdio ACP process and keeps one coding session for a run.

## Run

```bash
npm run dev -- doctor
npm run dev -- run
```

## Test

```bash
npm run test -- tests/acp-agent.test.ts
```

## Config

| var                 | default      | what                                        |
| ------------------- | ------------ | ------------------------------------------- |
| `agent.command`     | required     | Executable for the ACP worker               |
| `agent.args`        | `[]`         | Arguments passed to the worker              |
| `agent.env`         | `{}`         | Environment overrides for the child process |
| `agent.permissions` | `auto-allow` | Answer ACP permission requests              |

## Interfaces

The process exchanges newline-delimited JSON over stdin and stdout. Setpoint initializes ACP, opens
a session, sends prompts, reads updates, and closes the session.

See [configuration](../../docs/reference/config.md).
