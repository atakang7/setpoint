# CLI and HTTP interface

## Commands

| command              | flags                                                  | result                                                   |
| -------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `setpoint init`      | `-c, --config`                                         | Writes a default config if absent                        |
| `setpoint doctor`    | `-c, --config`                                         | Checks the config, ACP executable, and optional Chromium |
| `setpoint run`       | `-c, --config`                                         | Starts a new run                                         |
| `setpoint inspect`   | `-c, --config`, `--watch`, `--json`, `--interval <ms>` | Reads the latest run                                     |
| `setpoint ui`        | `-c, --config`, `--host`, `--port`, `--no-open`        | Starts a local dashboard                                 |
| `setpoint --version` | none                                                   | Prints the CLI version                                   |

`--config` defaults to `setpoint.yaml`. Watch intervals start at `100ms`; the default is `1000ms`
.

`setpoint run` exits with status `2` when the iteration limit is reached without a pass.
`setpoint doctor` exits with status `1` if a check fails.

## HTTP

The dashboard listens on `127.0.0.1:3210` by default.

| method | path                    | response                     |
| ------ | ----------------------- | ---------------------------- |
| GET    | `/`                     | Dashboard HTML               |
| GET    | `/api/state`            | Current run snapshot as JSON |
| GET    | `/artifact?path=<file>` | Image within the current run |

`/artifact` rejects files outside the current run, including symlink targets. The UI has no
authentication layer.
