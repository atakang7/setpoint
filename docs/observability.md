# Run observability

Setpoint persists enough state to reconstruct a run while it is happening. The CLI inspector and browser UI are deliberately **read-only projections** over that persisted state. They never prompt agents, alter verdicts, or transition the state machine.

## Terminal

```bash
setpoint inspect
```

prints a concise snapshot of the latest run: phase, iteration, elapsed time, frozen North Star, persistent coder session, observation count, latest judge direction, jury status, and iteration history.

```bash
setpoint inspect --watch
```

refreshes that view until the run reaches `done` or `failed`.

Useful variants:

```bash
setpoint inspect --json
setpoint inspect --watch --interval 500
```

`--json` returns the reconstructed snapshot, including persisted turns, observations, judgments, and jury verdicts.

## Browser

```bash
setpoint ui
```

starts a local read-only dashboard on `127.0.0.1:3210` and opens it in the default browser when possible.

The dashboard shows:

- live run phase and iteration
- persistent coder command and ACP session id
- frozen North Star
- latest browser screenshots
- latest progress judgment and critical gaps
- per-iteration judge/jury history
- before/after screenshot comparison between iterations

Options:

```bash
setpoint ui --port 8765
setpoint ui --host 0.0.0.0 --no-open
```

Binding beyond localhost can expose run artifacts to other machines. Use an appropriate local/network boundary.

## Source of truth

Both views reconstruct state from the existing run directory:

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

`SetpointEngine` remains the sole controller/writer. Observability must never become a second orchestrator.
