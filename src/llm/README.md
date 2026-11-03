Part of [setpoint](../../README.md).

# Evaluators

`AgentStructuredModel` runs fresh ACP sessions; `OpenAIStructuredModel` calls the OpenAI Responses
API.

## Run

```bash
npm run dev -- run
```

## Test

```bash
npm run test -- tests/agent-provider.test.ts
```

## Config

| var                  | default  | what                                        |
| -------------------- | -------- | ------------------------------------------- |
| `models.provider`    | required | `agent` or `openai`                         |
| `models.permissions` | `deny`   | ACP evaluator tool permissions              |
| `models.profiles`    | `{}`     | Per-role ACP command and argument overrides |
| `OPENAI_API_KEY`     | unset    | Required by the optional OpenAI provider    |

## Interfaces

Both adapters implement `StructuredModel.completeJson` with a prompt, JSON schema, model name, and
optional screenshot paths.

See [configuration](../../docs/reference/config.md).
