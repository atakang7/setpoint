# Architecture

Setpoint coordinates a coding session, an observer, and short-lived evaluator sessions. Its state is stored on disk rather than in the evaluator conversations.

```text
defining -> coding -> observing -> judging
             ^                    |
             |       CONTINUE ----+
             |                    |
             +---- jury FAIL -----+-- FINAL_CANDIDATE -> jury -> done
```

The definer runs once and writes `north-star.json`. The coding agent keeps its ACP session for the whole run. After every coding turn, the observer records screenshots or command output, and a fresh judge session checks that evidence against the original target.

A judge cannot approve a run. It can send the coder back to work or request a final jury. Each juror receives the same target and evidence in its own session. A jury failure sends its findings to the existing coder. The iteration limit ends the run with `failed` if no jury passes it.

## Boundaries

- `CodingAgent` manages the worker session; `Observer` gathers evidence.
- `StructuredModel` handles one-off definer, judge, and jury requests.
- `RunStorage` persists the record and files beneath `.setpoint/runs/`.
- `SetpointEngine` owns phase transitions. The CLI inspector and UI only read persisted files.

The default evaluator uses fresh ACP sessions. The OpenAI API adapter is optional. Browser observation starts the configured local command if supplied; command observation executes the configured shell command.

The target is not rewritten during a run. Neither observer output nor agent claims can change it. See [run inspection](observability.md) for the saved files and read-only UI.
