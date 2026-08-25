import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";

const promptOverridesZ = z
  .object({
    ideal_definer: z.string().optional(),
    coder: z.string().optional(),
    judge: z.string().optional(),
    jury: z.string().optional(),
  })
  .default({});

const agentProfileZ = z.object({
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  permissions: z.enum(["auto-allow", "deny"]).optional(),
});

const agentModelsZ = z.object({
  provider: z.literal("agent"),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).default({}),
  permissions: z.enum(["auto-allow", "deny"]).default("deny"),
  ideal_definer: z.string().default("default"),
  judge: z.string().default("default"),
  jury: z.array(z.string()).min(1).default(["default", "default", "default"]),
  profiles: z.record(z.string(), agentProfileZ).default({}),
});

const openAIModelsZ = z.object({
  provider: z.literal("openai"),
  api_key_env: z.string().default("OPENAI_API_KEY"),
  base_url: z.string().url().optional(),
  ideal_definer: z.string().default("gpt-5.6-sol"),
  judge: z.string().default("gpt-5.6-terra"),
  jury: z.array(z.string()).min(1).default(["gpt-5.6-sol", "gpt-5.6-sol", "gpt-5.6-sol"]),
});

const configZ = z.object({
  version: z.literal(1).default(1),
  task: z.string().min(1),
  agent: z.object({
    protocol: z.literal("acp").default("acp"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
    permissions: z.enum(["auto-allow", "deny"]).default("auto-allow"),
  }),
  models: z.discriminatedUnion("provider", [agentModelsZ, openAIModelsZ]),
  observer: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("browser"),
      url: z.string().url(),
      start_command: z.string().optional(),
      ready_timeout_ms: z.number().int().positive().default(60_000),
      full_page: z.boolean().default(true),
      viewports: z
        .array(
          z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
        )
        .min(1)
        .default([
          { width: 1440, height: 1000 },
          { width: 390, height: 844 },
        ]),
    }),
    z.object({
      type: z.literal("command"),
      command: z.string().min(1),
      timeout_ms: z.number().int().positive().default(60_000),
    }),
  ]),
  prompts: promptOverridesZ,
  autopilot: z
    .object({
      max_iterations: z.number().int().min(1).default(20),
      require_unanimous_jury: z.boolean().default(true),
    })
    .default({ max_iterations: 20, require_unanimous_jury: true }),
  run_dir: z.string().default(".setpoint"),
});

export type SetpointConfig = z.infer<typeof configZ>;

export async function loadConfig(path = "setpoint.yaml"): Promise<SetpointConfig> {
  const text = await readFile(resolve(path), "utf8");
  return configZ.parse(YAML.parse(text));
}

export const DEFAULT_CONFIG = `# Setpoint v1 configuration
version: 1

task: >
  Describe the outcome you want. Talk like a developer, not a spec writer.
  Example: Build a premium launch experience for this product. It should feel
  like a serious Apple/Microsoft launch, not a generic AI landing page.

agent:
  protocol: acp
  command: npx
  args: ["@agentclientprotocol/claude-agent-acp"]
  permissions: auto-allow

# By default Setpoint opens fresh standalone sessions of the same ACP agent for
# the North Star definer, progress judge, and final jurors. No API key is needed.
models:
  provider: agent
  permissions: deny
  ideal_definer: default
  judge: default
  jury: [default, default, default]

# Optional: define stronger/different standalone-agent profiles and reference
# their names above. Command/args/env inherit from the main coding agent.
# profiles:
#   strong:
#     args: ["@agentclientprotocol/claude-agent-acp", "--model", "<model>"]

observer:
  type: browser
  url: http://localhost:3000
  start_command: npm run dev
  ready_timeout_ms: 60000
  full_page: true
  viewports:
    - { width: 1440, height: 1000 }
    - { width: 390, height: 844 }

autopilot:
  max_iterations: 20
  require_unanimous_jury: true

prompts:
  ideal_definer: |
    Be ambitious but concrete. Define the middle ground between vague taste and a software spec.
  coder: |
    Keep pushing the observable result. Do not stop at technically complete.
  judge: |
    Be strict. Do not reward effort, code quality, or partial completion.
  jury: |
    Pass only if the observable result genuinely reaches the North Star.
`;

export async function initConfig(path = "setpoint.yaml"): Promise<"created" | "exists"> {
  try {
    await access(path);
    return "exists";
  } catch {
    await writeFile(path, DEFAULT_CONFIG, "utf8");
    return "created";
  }
}
