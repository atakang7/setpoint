# Architecture

`SetpointEngine` coordinates one persistent coder session, observations, and short-lived evaluator sessions.

## Sessions

- `AcpCodingAgent` keeps the worker's ACP session across coder iterations.
- `AgentStructuredModel` starts a fresh ACP session for each definer, judge, or juror request.
- `OpenAIStructuredModel` provides the optional API evaluator.
- The definer writes `north-star.json` once; judgments use the same target.
- A judge returns `CONTINUE` or `FINAL_CANDIDATE`; only a jury can approve the run.
- A failed jury sends feedback to the existing coder; `max_iterations` ends an unfinished run.

## Storage

- `RunStorage` writes the run record and artifacts under `.setpoint/runs/<run-id>/`.
- `SetpointEngine` alone changes phases; `inspect` and `ui` only read saved state.
