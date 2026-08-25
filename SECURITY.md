# Security

Setpoint can drive coding agents that execute commands and modify files. Treat autonomous runs as code execution.

- Prefer a sandbox, container, VM, or least-privilege development account.
- Review `agent.permissions` before running unfamiliar repositories.
- Never commit API keys or agent credentials.
- Treat repository-provided `setpoint.yaml` files as executable configuration because observer and agent commands may launch local processes.

For security-sensitive reports, do not open a public issue containing exploit details. Contact the repository owner privately through the contact method listed on their GitHub profile.
