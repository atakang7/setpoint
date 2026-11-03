# Inspecting runs

`loadRunSnapshot` reconstructs the latest run from files written by `RunStorage`.

```text
+----------------------+
| SetpointEngine       |
+----------------------+
           |
         writes
           v
+----------------------+
| RunStorage           |
+----------------------+
           |
         writes
           v
+----------------------+
| .setpoint/runs       |
+----------------------+
           |
        run files
           v
+----------------------+
| loadRunSnapshot      |
+----------------------+
           |
        snapshot
           v
+----------------------+
| inspect / startRunUi |
+----------------------+
```

## Run

```sh
setpoint inspect
setpoint inspect --json
setpoint inspect --watch --interval 500
setpoint ui --port 8765 --no-open
```

## Limits

- `inspect` and `ui` cannot change phases or agent decisions.
- The dashboard listens on `127.0.0.1:3210` by default; `--host 0.0.0.0` exposes run details to the network.
- `inspect --watch` stops when the run reaches `done` or `failed`.
