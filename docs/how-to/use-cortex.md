# Run with Cortex

1. Install Cortex and authenticate the command that supports `cortex --acp`.
2. Run `setpoint init` in the project Setpoint will control.
3. Set the agent and evaluator fields in `setpoint.yaml`:

```yaml
agent:
  command: cortex
  args: ["--acp"]
  permissions: auto-allow

models:
  provider: agent
  permissions: deny
```

4. Set `task` and an `observer` for the project. See [configuration](../reference/config.md).
5. Run `setpoint doctor`, then `setpoint run`.
