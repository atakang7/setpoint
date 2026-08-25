import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SetpointEngine } from "../src/engine.js";
import { RunStorage } from "../src/storage.js";
import type { SetpointConfig } from "../src/config.js";
import type {
  CodingAgent,
  Observation,
  Observer,
  PromptTurnResult,
  StructuredModel,
} from "../src/types.js";

const config: SetpointConfig = {
  version: 1,
  task: "Make the product feel finished and premium.",
  agent: { protocol: "acp", command: "fake", args: [], env: {}, permissions: "auto-allow" },
  models: {
    provider: "openai",
    api_key_env: "OPENAI_API_KEY",
    ideal_definer: "ideal",
    judge: "judge",
    jury: ["jury-a", "jury-b", "jury-c"],
  },
  observer: { type: "command", command: "fake", timeout_ms: 1000 },
  prompts: {},
  autopilot: { max_iterations: 3, require_unanimous_jury: true },
  run_dir: ".setpoint",
};
class FakeAgent implements CodingAgent {
  prompts: string[] = [];
  async start(): Promise<void> {}
  async prompt(text: string): Promise<PromptTurnResult> {
    this.prompts.push(text);
    return { stopReason: "end_turn", text: "done" };
  }
  sessionId(): string {
    return "fake-session";
  }
  async close(): Promise<void> {}
}
class FakeObserver implements Observer {
  captures = 0;
  async start(): Promise<void> {}
  async capture(): Promise<Observation> {
    this.captures++;
    return { kind: "command", summary: "visible result", artifacts: [], metadata: {} };
  }
  async close(): Promise<void> {}
}
class FakeModel implements StructuredModel {
  calls: string[] = [];
  async completeJson<T>(options: {
    model: string;
    prompt: string;
    schemaName: string;
    schema: Record<string, unknown>;
    imagePaths?: string[];
  }): Promise<T> {
    this.calls.push(options.schemaName);
    if (options.schemaName === "setpoint_north_star")
      return {
        vision: "A finished premium result",
        experience: ["Feels deliberate"],
        quality_bar: "Top-tier shipped product",
        avoid: ["generic"],
        guidance: {
          reasoning: "Use leverage",
          recommendations: ["Use a mature library"],
          strength: "strong",
        },
      } as T;
    if (options.schemaName === "setpoint_progress_judgment") {
      const count = this.calls.filter((x) => x === "setpoint_progress_judgment").length;
      return (
        count === 1
          ? {
              verdict: "CONTINUE",
              assessment: "Not there yet",
              critical_gaps: ["Weak middle"],
              next_direction: "Strengthen the middle",
              confidence: 0.9,
            }
          : {
              verdict: "FINAL_CANDIDATE",
              assessment: "Close",
              critical_gaps: [],
              next_direction: "",
              confidence: 0.95,
            }
      ) as T;
    }
    return { verdict: "PASS", reason: "North Star reached", critical_gaps: [] } as T;
  }
}
describe("engine", () => {
  it("continues after a judge rejection and requires the final jury", async () => {
    const dir = await mkdtemp(join(tmpdir(), "setpoint-engine-"));
    const agent = new FakeAgent();
    const observer = new FakeObserver();
    const model = new FakeModel();
    const storage = new RunStorage(".setpoint", dir, "test-run");
    const result = await new SetpointEngine(config, {
      model,
      agent,
      observer,
      storage,
      cwd: dir,
    }).run();
    expect(result.passed).toBe(true);
    expect(result.record.phase).toBe("done");
    expect(agent.prompts).toHaveLength(2);
    expect(observer.captures).toBe(2);
    expect(model.calls.filter((x) => x.startsWith("setpoint_jury_"))).toHaveLength(3);
    expect(agent.prompts[1]).toContain("Strengthen the middle");
  });
});
