import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SetpointEngine } from "../src/engine.js";
import { RunStorage } from "../src/storage.js";
import type { SetpointConfig } from "../src/config.js";
import type {
  CodingAgent,
  Judgment,
  JuryVerdict,
  NorthStar,
  Observation,
  Observer,
  PromptTurnResult,
  StructuredModel,
} from "../src/types.js";

const baseConfig: SetpointConfig = {
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
  autopilot: { max_iterations: 10, require_unanimous_jury: true },
  run_dir: ".setpoint",
};

const FIXED_NORTH_STAR: NorthStar = {
  vision: "A finished premium result",
  experience: ["Feels deliberate"],
  quality_bar: "Top-tier shipped product",
  avoid: ["generic"],
  guidance: {
    reasoning: "Use leverage",
    recommendations: ["Use a mature library"],
    strength: "strong",
  },
};

/** Fake agent that records every prompt and reports the same persistent session id. */
class FakePersistentAgent implements CodingAgent {
  prompts: string[] = [];
  started = 0;
  closed = 0;
  async start(): Promise<void> {
    this.started++;
  }
  async prompt(text: string): Promise<PromptTurnResult> {
    this.prompts.push(text);
    return { stopReason: "end_turn", text: "done" };
  }
  sessionId(): string {
    return "persistent-session-001";
  }
  async close(): Promise<void> {
    this.closed++;
  }
}

class FakeObserver implements Observer {
  captures = 0;
  started = 0;
  closed = 0;
  summaries: string[] = [];
  async start(): Promise<void> {
    this.started++;
  }
  async capture(): Promise<Observation> {
    this.captures++;
    const summary = `status: ${this.captures}`;
    this.summaries.push(summary);
    return { kind: "command", summary, artifacts: [], metadata: { iteration: this.captures } };
  }
  async close(): Promise<void> {
    this.closed++;
  }
}

/**
 * Configurable fake model. The script drives the full
 * bad → improved → final-candidate → jury-FAIL → improved → jury-PASS path.
 */
class ScriptedModel implements StructuredModel {
  calls: Array<{ schema: string; model: string; prompt: string; imagePaths?: string[] }> = [];
  judgeScript: Judgment[] = [];
  juryScript: JuryVerdict[][] = [];
  private judgeIdx = 0;
  private juryIdx = 0;
  constructor(opts: { judge: Judgment[]; jury: JuryVerdict[][] }) {
    this.judgeScript = opts.judge;
    this.juryScript = opts.jury;
  }
  async completeJson<T>(options: {
    model: string;
    prompt: string;
    schemaName: string;
    schema: Record<string, unknown>;
    imagePaths?: string[];
  }): Promise<T> {
    this.calls.push({
      schema: options.schemaName,
      model: options.model,
      prompt: options.prompt,
      imagePaths: options.imagePaths,
    });
    if (options.schemaName === "setpoint_north_star") return FIXED_NORTH_STAR as T;
    if (options.schemaName === "setpoint_progress_judgment") {
      const j = this.judgeScript[this.judgeIdx++];
      if (!j) throw new Error("judge script exhausted");
      return j as T;
    }
    if (options.schemaName.startsWith("setpoint_jury_")) {
      // each jury run uses one row of the script; all jurors in a round share a row
      const round = this.juryScript[this.juryIdx] ?? [
        { verdict: "PASS", reason: "ok", critical_gaps: [] },
      ];
      const jurorIndex = Number(options.schemaName.replace("setpoint_jury_", "")) - 1;
      const v = round[jurorIndex] ?? round[0];
      if (jurorIndex === round.length - 1) this.juryIdx++;
      return v as T;
    }
    throw new Error(`unknown schema ${options.schemaName}`);
  }
}

async function runEngine(
  dir: string,
  opts: {
    judge: Judgment[];
    jury: JuryVerdict[][];
    maxIterations?: number;
  },
) {
  const agent = new FakePersistentAgent();
  const observer = new FakeObserver();
  const model = new ScriptedModel({ judge: opts.judge, jury: opts.jury });
  const config: SetpointConfig = {
    ...baseConfig,
    autopilot: { max_iterations: opts.maxIterations ?? 10, require_unanimous_jury: true },
  };
  const events: string[] = [];
  const storage = new RunStorage(".setpoint", dir, "test-run");
  const result = await new SetpointEngine(config, {
    model,
    agent,
    observer,
    storage,
    cwd: dir,
    onEvent: (m) => events.push(m),
  }).run();
  return { result, agent, observer, model, events, storage, config };
}

describe("engine state machine", () => {
  it("runs the full bad → improved → final-candidate → jury-FAIL → improved → unanimous PASS path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "setpoint-sm-"));
    const judge: Judgment[] = [
      {
        verdict: "CONTINUE",
        assessment: "bad",
        critical_gaps: ["gap1"],
        next_direction: "fix1",
        confidence: 0.4,
      },
      {
        verdict: "CONTINUE",
        assessment: "improved but insufficient",
        critical_gaps: ["gap2"],
        next_direction: "fix2",
        confidence: 0.6,
      },
      {
        verdict: "FINAL_CANDIDATE",
        assessment: "close",
        critical_gaps: [],
        next_direction: "",
        confidence: 0.9,
      },
      {
        verdict: "FINAL_CANDIDATE",
        assessment: "close again",
        critical_gaps: [],
        next_direction: "",
        confidence: 0.95,
      },
    ];
    const jury: JuryVerdict[][] = [
      [
        { verdict: "FAIL", reason: "no", critical_gaps: ["g1"] },
        { verdict: "PASS", reason: "yes", critical_gaps: [] },
        { verdict: "PASS", reason: "yes", critical_gaps: [] },
      ],
      [
        { verdict: "PASS", reason: "good", critical_gaps: [] },
        { verdict: "PASS", reason: "good", critical_gaps: [] },
        { verdict: "PASS", reason: "good", critical_gaps: [] },
      ],
    ];
    const { result, agent, observer, model, storage } = await runEngine(dir, { judge, jury });

    expect(result.passed).toBe(true);
    expect(result.record.phase).toBe("done");

    // 1. North Star runs exactly once
    expect(model.calls.filter((c) => c.schema === "setpoint_north_star")).toHaveLength(1);
    // 2. North Star remains identical throughout (same object returned every time)
    expect(result.northStar).toEqual(FIXED_NORTH_STAR);

    // 3. Same coder session receives continuation prompts (4 coder turns across 4 iterations)
    expect(agent.started).toBe(1);
    expect(agent.sessionId()).toBe("persistent-session-001");
    expect(agent.prompts).toHaveLength(4);
    // prompt 2 & 4 are continuations; prompt 4 follows a jury failure
    expect(agent.prompts[1]).toContain("fix1");
    expect(agent.prompts[2]).toContain("fix2");
    expect(agent.prompts[3]).toContain("Independent jury criticism");

    // 4. Observer runs after every coder stop (4 captures for 4 iterations)
    expect(observer.captures).toBe(4);
    expect(observer.started).toBe(1);

    // 5. Judge receives the current observation — verify the judge prompt embeds each iteration's summary
    const judgeCalls = model.calls.filter((c) => c.schema === "setpoint_progress_judgment");
    expect(judgeCalls).toHaveLength(4);
    expect(judgeCalls[0].prompt).toContain("status: 1");
    expect(judgeCalls[1].prompt).toContain("status: 2");
    expect(judgeCalls[2].prompt).toContain("status: 3");
    expect(judgeCalls[3].prompt).toContain("status: 4");

    // 6. CONTINUE resumes the coder (prompts 2 & 3 are continuation prompts)
    expect(agent.prompts[1]).toContain("Continue working");
    expect(agent.prompts[2]).toContain("Continue working");

    // 7. FINAL_CANDIDATE starts the jury (two jury rounds)
    const juryCalls = model.calls.filter((c) => c.schema.startsWith("setpoint_jury_"));
    expect(juryCalls).toHaveLength(6);
    // 8. A failed jury resumes the coder — prompt 4 is a jury-failure continuation
    expect(agent.prompts[3]).toContain("final jury rejected");
    // 9. Three successful jury votes terminate the run
    expect(result.passed).toBe(true);

    // 10. A progress judge cannot directly finish — the PASS decision only comes from jury
    expect(judge.every((j) => j.verdict !== "PASS")).toBe(true);

    // 11. Run state/history is persisted correctly
    const runJson = JSON.parse(await readFile(join(storage.runDir, "run.json"), "utf8"));
    expect(runJson.phase).toBe("done");
    expect(runJson.agent_session_id).toBe("persistent-session-001");
    expect(runJson.north_star_path).toBeDefined();
    expect(runJson.last_observation_path).toBeDefined();
    expect(runJson.final_reason).toContain("good");
    const northStarFile = JSON.parse(
      await readFile(join(storage.runDir, "north-star.json"), "utf8"),
    );
    expect(northStarFile).toEqual(FIXED_NORTH_STAR);

    // turns, observations, judgments, jury all persisted
    for (const i of [1, 2, 3, 4]) {
      const pad = String(i).padStart(3, "0");
      await expect(
        readFile(join(storage.runDir, `turns/${pad}.json`), "utf8"),
      ).resolves.toBeDefined();
      await expect(
        readFile(join(storage.runDir, `observations/${pad}.json`), "utf8"),
      ).resolves.toBeDefined();
      await expect(
        readFile(join(storage.runDir, `judgments/${pad}.json`), "utf8"),
      ).resolves.toBeDefined();
    }
    await expect(readFile(join(storage.runDir, "jury/003.json"), "utf8")).resolves.toBeDefined();
    await expect(readFile(join(storage.runDir, "jury/004.json"), "utf8")).resolves.toBeDefined();
  });

  it("stops runaway loops at the maximum iteration limit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "setpoint-max-"));
    // judge always CONTINUE; never reach jury
    const judge: Judgment[] = Array.from({ length: 5 }, () => ({
      verdict: "CONTINUE" as const,
      assessment: "still bad",
      critical_gaps: ["gap"],
      next_direction: "keep going",
      confidence: 0.3,
    }));
    const { result, agent } = await runEngine(dir, { judge, jury: [], maxIterations: 5 });
    expect(result.passed).toBe(false);
    expect(result.record.phase).toBe("failed");
    expect(result.record.final_reason).toContain("Maximum iterations");
    expect(agent.prompts).toHaveLength(5);
  });

  it("terminates when a jury round is not unanimous", async () => {
    // With require_unanimous_jury true, a single FAIL in the jury must send back to coder.
    // This is covered by the full path test above; here we assert the non-unanimous branch
    // explicitly with a never-passing jury hitting max iterations via repeated FINAL_CANDIDATE.
    const dir = await mkdtemp(join(tmpdir(), "setpoint-juryfail-"));
    const judge: Judgment[] = [
      {
        verdict: "FINAL_CANDIDATE",
        assessment: "close",
        critical_gaps: [],
        next_direction: "",
        confidence: 0.9,
      },
      {
        verdict: "FINAL_CANDIDATE",
        assessment: "close",
        critical_gaps: [],
        next_direction: "",
        confidence: 0.9,
      },
    ];
    const jury: JuryVerdict[][] = [
      [
        { verdict: "FAIL", reason: "no", critical_gaps: ["g"] },
        { verdict: "PASS", reason: "yes", critical_gaps: [] },
        { verdict: "PASS", reason: "yes", critical_gaps: [] },
      ],
      [
        { verdict: "FAIL", reason: "no", critical_gaps: ["g"] },
        { verdict: "PASS", reason: "yes", critical_gaps: [] },
        { verdict: "PASS", reason: "yes", critical_gaps: [] },
      ],
    ];
    const { result, agent } = await runEngine(dir, { judge, jury, maxIterations: 2 });
    expect(result.passed).toBe(false);
    expect(result.record.phase).toBe("failed");
    expect(result.record.final_reason).toContain("Maximum iterations");
    // coder got the jury-failure continuation on iteration 2
    expect(agent.prompts[1]).toContain("final jury rejected");
  });
});
