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

    const visualContext = options.imagePaths?.length
      ? "\n\nVISUAL EVIDENCE\nThe browser screenshots are attached directly to this prompt as images. Judge the pixels you see. Do NOT use tools or inspect files."
      : "";

    const outputContract = `\n\nOUTPUT CONTRACT — CRITICAL\nReturn exactly one JSON object and nothing else. Do NOT use any tools. Do NOT run commands. Do NOT inspect files. Think briefly, then output the JSON object directly.\nNo markdown fences, no commentary, no preamble.\nThe object must satisfy this JSON Schema:\n${JSON.stringify(options.schema, null, 2)}`;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await agent.start(this.options.cwd);
        const corrective =
          attempt > 0 && lastError
            ? `\n\nPREVIOUS ATTEMPT FAILED\nYour previous response was not valid JSON: ${lastError.message}\nReturn ONLY a JSON object matching the schema. No markdown, no prose, no code fences.`
            : "";
        const prompt = `${options.prompt}${visualContext}${outputContract}${corrective}`;
        const result = options.imagePaths?.length
          ? await agent.promptWithImages(prompt, options.imagePaths)
          : await agent.prompt(prompt);
        return parseJsonObject<T>(result.text, options.schemaName);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Close this agent session and try again with a fresh one.
        await agent.close().catch(() => undefined);
        if (attempt < 2) continue;
        throw lastError;
      } finally {
        await agent.close().catch(() => undefined);
      }
    }
    throw lastError ?? new Error(`Agent session failed for ${options.schemaName}`);
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
