# Cortex ACP

Cortex can run as a Setpoint worker through its stdio ACP command.

```yaml
agent:
  protocol: acp
  command: cortex
  args: ["--acp"]
  permissions: auto-allow

models:
  provider: agent
```

## Run

```sh
setpoint doctor
setpoint run
```

## Limits

- `cortex` must be on `PATH` and authenticated.
- The coder keeps one ACP session; definer, judge, and jurors use fresh sessions.
- `models.profiles` can set different commands for evaluator roles.
