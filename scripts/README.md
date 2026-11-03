Part of [setpoint](../README.md) .

# Dashboard test script

`ui-e2e.mjs` starts the compiled dashboard against a temporary run and checks Chromium rendering and
artifact isolation.

## Run

```bash
npm run build
node scripts/ui-e2e.mjs
```

## Test

```bash
node scripts/ui-e2e.mjs
```

## Config

| var      | default        | what                                          |
| -------- | -------------- | --------------------------------------------- |
| `config` | temporary file | Script writes its own `setpoint.yaml` fixture |

## Interfaces

The script writes desktop and mobile screenshots to `browser-evidence/` , then checks `/api/state`
and `/artifact` .
