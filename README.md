# Setpoint

Setpoint is a Node.js CLI for developers who want coding agents judged against an observable product
target.

```text
+------------+
| src/cli.ts |
+------------+
      | runs
      v
+----------------+
| SetpointEngine |
+----------------+
      | prompts
      v
+----------------+
| AcpCodingAgent |
+----------------+
      | stops
      v
+----------+
| Observer |
+----------+
      | evidence
      v
+-----------------+
| StructuredModel |
+-----------------+
      | verdict
      v
+------------+
| RunStorage |
+------------+
```

## Quick start

Use Node.js `22.12.0` and an authenticated ACP agent.

```bash
npm ci
npm run dev -- init
```

Edit `setpoint.yaml` to set the task, agent command, and observer.

```bash
npx playwright install chromium
npm run dev -- doctor
npm run dev -- run
```

## Layout

| path                                    | what it is                                           |
| --------------------------------------- | ---------------------------------------------------- |
| [src/](src/README.md)                   | CLI, engine, configuration, run state, and dashboard |
| [src/agent/](src/agent/README.md)       | Persistent ACP coding sessions                       |
| [src/llm/](src/llm/README.md)           | Agent and API evaluator adapters                     |
| [src/observer/](src/observer/README.md) | Browser and command capture                          |
| [scripts/](scripts/README.md)           | Dashboard browser test                               |

## Docs

[Documentation index](docs/README.md), [configuration](docs/reference/config.md),
[architecture](docs/explanation/architecture.md).

```text
push/PR -> npm ci -> Chromium -> npm run check
```

## Limits

- Autonomous coding sessions can execute commands and edit files. Use a sandbox.
- The CLI needs a local ACP executable; the browser observer needs Chromium.
