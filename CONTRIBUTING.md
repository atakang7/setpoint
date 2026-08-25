# Contributing

Thanks for helping improve Setpoint.

## Local setup

```bash
npm install
npm run check
```

## Pull requests

Keep changes focused. New adapters should implement the existing `CodingAgent`, `Observer`, or `StructuredModel` interfaces rather than adding provider logic to the engine.

Behavior changes to the state machine should include tests. Prompt changes should preserve the core invariant: Setpoint judges the observable result, not implementation quality.

Use Conventional Commit-style PR titles where practical (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Release Please derives release notes and semantic versions from merged history.
