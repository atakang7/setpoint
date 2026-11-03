Part of [setpoint](../../README.md) .

# Observers

`BrowserObserver` captures Playwright pages; `CommandObserver` captures a shell command's exit
status and output.

## Run

```bash
npm run dev -- run
```

## Test

```bash
npm run test -- tests/browser-observer.test.ts tests/command-observer.test.ts
```

## Config

| var                   | default              | what                            |
| --------------------- | -------------------- | ------------------------------- |
| `observer.type`       | required             | `browser` or `command`          |
| `observer.url`        | required for browser | URL to capture                  |
| `observer.command`    | required for command | Shell command to execute        |
| `observer.timeout_ms` | `60000`              | Command timeout in milliseconds |

## Interfaces

Browser captures write viewport PNGs and `metadata.json` . Command captures write `command.txt` .
Both return an `Observation` with artifact paths.

See [configuration](../../docs/reference/config.md) and
[run files](../../docs/reference/run-files.md) .
