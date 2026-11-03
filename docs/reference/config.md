# Configuration

`setpoint.yaml` is parsed by `src/config.ts`. Schema version is `1`.

## Required fields

| field             | default  | meaning                      |
| ----------------- | -------- | ---------------------------- |
| `version`         | `1`      | Configuration schema version |
| `task`            | required | Desired observable result    |
| `agent.command`   | required | ACP worker executable        |
| `models.provider` | required | `agent` or `openai`          |
| `observer.type`   | required | `browser` or `command`       |

## Agent and evaluator

| field                  | default                           | meaning                                                     |
| ---------------------- | --------------------------------- | ----------------------------------------------------------- |
| `agent.protocol`       | `acp`                             | Worker protocol                                             |
| `agent.args`           | `[]`                              | Worker process arguments                                    |
| `agent.env`            | `{}`                              | Worker environment overrides                                |
| `agent.permissions`    | `auto-allow`                      | ACP permission policy                                       |
| `models.command`       | `agent.command`                   | ACP evaluator executable                                    |
| `models.args`          | `agent.args`                      | ACP evaluator arguments                                     |
| `models.env`           | `{}`                              | ACP evaluator environment overrides                         |
| `models.permissions`   | `deny`                            | ACP evaluator permission policy                             |
| `models.profiles`      | `{}`                              | Named overrides for `command`, `args`, `env`, `permissions` |
| `models.ideal_definer` | `default` for agent               | Definer profile or model                                    |
| `models.judge`         | `default` for agent               | Judge profile or model                                      |
| `models.jury`          | three `default` entries for agent | Jury profiles or models                                     |
| `models.api_key_env`   | `OPENAI_API_KEY`                  | OpenAI provider credential variable                         |
| `models.base_url`      | unset                             | Optional OpenAI provider URL                                |

OpenAI provider defaults are `gpt-5.6-sol` for definer and jury and `gpt-5.6-terra` for judge.

## Observation

| field                       | default                | meaning                                |
| --------------------------- | ---------------------- | -------------------------------------- |
| `observer.url`              | required for browser   | Browser target URL                     |
| `observer.start_command`    | unset                  | Command started before browser capture |
| `observer.ready_timeout_ms` | `60000`                | Browser readiness deadline             |
| `observer.full_page`        | `true`                 | Full page screenshots                  |
| `observer.viewports`        | `1440x1000`, `390x844` | Screenshot viewport sizes              |
| `observer.command`          | required for command   | Shell command to capture               |
| `observer.timeout_ms`       | `60000`                | Command execution deadline             |

## Run

| field                                                                     | default     | meaning                   |
| ------------------------------------------------------------------------- | ----------- | ------------------------- |
| `autopilot.max_iterations`                                                | `20`        | Maximum coder turns       |
| `autopilot.require_unanimous_jury`                                        | `true`      | All jurors must pass      |
| `run_dir`                                                                 | `.setpoint` | Persisted state directory |
| `prompts.ideal_definer`, `prompts.coder`, `prompts.judge`, `prompts.jury` | unset       | Role prompt additions     |
