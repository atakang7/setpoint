Part of [setpoint](../README.md).

# CLI and engine

`cli.ts` exposes the commands; `SetpointEngine` runs the coder, observer, judge, and jury loop.

## Run

```bash
npm run dev -- --help
npm run dev -- init
```

## Test

```bash
npm run test -- tests/engine.test.ts tests/inspect.test.ts
```

## Config

| var        | default         | what                                |
| ---------- | --------------- | ----------------------------------- |
| `--config` | `setpoint.yaml` | Configuration path for CLI commands |
| `run_dir`  | `.setpoint`     | Root for persisted runs             |

## Interfaces

The `setpoint` executable has `init`, `doctor`, `run`, `inspect`, and `ui` commands. The UI
reads `/api/state` and `/artifact` over local HTTP.

See [CLI reference](../docs/reference/cli.md) and
[architecture](../docs/explanation/architecture.md).
