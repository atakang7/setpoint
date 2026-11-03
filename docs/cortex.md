# Cortex / Axon

Cortex can be used as a native Setpoint worker through its ACP stdio mode. Cortex remains the coding-agent product; Axon continues to own its model/tool loop and persistent session.

```yaml
agent:
  protocol: acp
  command: cortex
  args: ["--acp"]
  permissions: auto-allow

models:
  provider: agent
```

With this configuration, Setpoint creates one persistent Cortex/Axon session for the coder and reuses it after every `CONTINUE` or failed jury result.

Reasoning roles can inherit Cortex as well, or override the ACP command in their role profile when you want a stronger/different standalone agent for the North Star, judge, or jury.

Cortex ACP support is currently the stable v1 subset Setpoint requires: initialize, new session, prompt, cancellation, close, and streamed message/tool updates.
