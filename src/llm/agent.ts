import type { AcpCodingAgentOptions } from "../agent/acp.js";
import { AcpCodingAgent } from "../agent/acp.js";
import type { StructuredModel } from "../types.js";

export type AgentModelProfile = Partial<AcpCodingAgentOptions>;

export interface AgentStructuredModelOptions {
  cwd: string;
  base: AcpCodingAgentOptions;
  profiles?: Record<string, AgentModelProfile>;
}

export class AgentStructuredModel implements StructuredModel {
  constructor(private readonly options: AgentStructuredModelOptions) {}

  async completeJson<T>(options: {
    model: string;
    prompt: string;
    schemaName: string;
    schema: Record<string, unknown>;
    imagePaths?: string[];
  }): Promise<T> {
    const profile = this.resolveProfile(options.model);
    const agent = new AcpCodingAgent(profile);

    const artifacts = options.imagePaths?.length
      ? `\n\nOBSERVABLE ARTIFACTS\nInspect these files directly with your available read/vision tools before deciding:\n${options.imagePaths.map((path) => `- ${path}`).join("\n")}`
      : "";

    const outputContract = `\n\nOUTPUT CONTRACT\nReturn exactly one JSON object and nothing else. No markdown fences, commentary, or preamble. The object must satisfy this JSON Schema:\n${JSON.stringify(options.schema, null, 2)}`;

    try {
      await agent.start(this.options.cwd);
      const result = await agent.prompt(`${options.prompt}${artifacts}${outputContract}`);
      return parseJsonObject<T>(result.text, options.schemaName);
    } finally {
      await agent.close().catch(() => undefined);
    }
  }

  private resolveProfile(name: string): AcpCodingAgentOptions {
    if (name === "default") return this.options.base;
    const override = this.options.profiles?.[name];
    if (!override) throw new Error(`Unknown agent model profile: ${name}`);
    return {
      command: override.command ?? this.options.base.command,
      args: override.args ?? this.options.base.args,
      env: { ...(this.options.base.env ?? {}), ...(override.env ?? {}) },
      permissions: override.permissions ?? this.options.base.permissions,
    };
  }
}

function parseJsonObject<T>(text: string, label: string): T {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) candidates.push(fenced);
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace)
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next extraction strategy.
    }
  }
  throw new Error(`Agent session returned invalid JSON for ${label}`);
}
