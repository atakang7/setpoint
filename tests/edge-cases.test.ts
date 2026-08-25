import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, initConfig } from "../src/config.js";
import { createRuntime } from "../src/factory.js";
import { SetpointEngine } from "../src/engine.js";
import { RunStorage } from "../src/storage.js";
import type {
  CodingAgent,
  NorthStar,
  Observation,
  Observer,
  StructuredModel,
} from "../src/types.js";

const NORTH_STAR: NorthStar = {
  vision: "A polished launch.",
  experience: ["clear visual confidence"],
  quality_bar: "ready to show publicly",
  avoid: ["generic AI template"],
  guidance: {
    reasoning: "optional",
    recommendations: ["a timeline lib may help"],
    strength: "light",
  },
};

const JUDGE_CONTINUE = {
  verdict: "CONTINUE",
  assessment: "not enough",
  critical_gaps: ["needs polish"],
  next_direction: "keep going",
  confidence: 0.4,
};
const JUDGE_FINAL = {
  verdict: "FINAL_CANDIDATE",
  assessment: "good enough",
  critical_gaps: [],
  next_direction: "",
  confidence: 0.8,
};

/* ---------- config edge cases ---------- */

describe("edge cases: config", () => {
  it("malformed setpoint.yaml → useful zod error, not raw stack", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sp-edge-cfg-"));
    const path = join(dir, "setpoint.yaml");
    await writeFile(path, 'version: 1\ntask: ""\n'); // empty task violates min(1)
    await expect(loadConfig(path)).rejects.toThrow(/task/i);
  });

  it("non-YAML garbage → parse error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sp-edge-garbage-"));
    const path = join(dir, "setpoint.yaml");
    await writeFile(path, "{{{{not yaml");
    await expect(loadConfig(path)).rejects.toThrow();
  });

  it("init refuses to overwrite an existing setpoint.yaml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sp-edge-init-"));
    const path = join(dir, "setpoint.yaml");
    await writeFile(path, "existing: true\n");
    const result = await initConfig(path);
    expect(result).toBe("exists");
  });
});

/* ---------- factory edge cases ---------- */

describe("edge cases: factory", () => {
  it("missing API key → clear error message naming the env var", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sp-edge-key-"));
    const path = join(dir, "setpoint.yaml");
    await writeFile(
      path,
      [
        "version: 1",
        "task: test",
        "agent: { protocol: acp, command: node }",
        "models: { provider: openai, api_key_env: MY_MISSING_KEY }",
        "observer: { type: command, command: echo hi }",
      ].join("\n"),
    );
    const config = await loadConfig(path);
    const before = process.env.MY_MISSING_KEY;
    delete process.env.MY_MISSING_KEY;
    try {
      expect(() => createRuntime(config, dir)).toThrow(/MY_MISSING_KEY/);
    } finally {
      if (before !== undefined) process.env.MY_MISSING_KEY = before;
    }
  });
});

/* ---------- engine edge cases ---------- */

function fakeDeps(opts: {
  model: StructuredModel;
  agent: CodingAgent;
  observer: Observer;
  cwd: string;
}) {
  const storage = new RunStorage(".setpoint", opts.cwd);
  return { ...opts, storage };
}

function fakeAgent(prompts: string[]): CodingAgent {
  return {
    start: async () => undefined,
    sessionId: () => "s1",
    prompt: async (p: string) => {
      prompts.push(p);
      return { stopReason: "end_turn", text: "done" };
    },
    close: async () => undefined,
  };
}

function fakeObserver(): Observer {
  return {
    start: async () => undefined,
    capture: async (): Promise<Observation> => ({
      kind: "command",
      summary: "STATUS: unfinished",
      artifacts: [],
    }),
    close: async () => undefined,
  };
}

describe("edge cases: engine", () => {
  it("judge returns malformed structured output → zod error surfaces", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sp-edge-malformed-"));
    const calls: string[] = [];
    const model: StructuredModel = {
      async completeJson<T>(o: { schemaName: string }): Promise<T> {
        calls.push(o.schemaName);
        if (o.schemaName === "setpoint_north_star") return NORTH_STAR as T;
        // judge returns a verdict that is not in the allowed enum
        return {
          verdict: "PASS",
          assessment: "x",
          critical_gaps: [],
          next_direction: "",
          confidence: 1,
        } as T;
      },
    };
    const prompts: string[] = [];
    const config = await loadConfig(await writeConfig(dir, { observer: "command", maxIter: 5 }));
    const engine = new SetpointEngine(
      config,
      fakeDeps({ model, agent: fakeAgent(prompts), observer: fakeObserver(), cwd: dir }),
    );
    await expect(engine.run()).rejects.toThrow();
    expect(calls).toContain("setpoint_progress_judgment");
  });

  it("jury disagreement → consolidated criticism fed back to coder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sp-edge-disagree-"));
    let juryCalls = 0;
    const model: StructuredModel = {
      async completeJson<T>(o: { schemaName: string }): Promise<T> {
        if (o.schemaName === "setpoint_north_star") return NORTH_STAR as T;
        if (o.schemaName.startsWith("setpoint_jury")) {
          juryCalls += 1;
          // first jury round (3 jurors): 2 PASS + 1 FAIL → not unanimous
          if (juryCalls <= 3) {
            const isFail = juryCalls === 3;
            return {
              verdict: isFail ? "FAIL" : "PASS",
              reason: isFail ? "not ready" : "ok",
              critical_gaps: [],
            } as T;
          }
          // second jury round: all PASS
          return { verdict: "PASS", reason: "ok", critical_gaps: [] } as T;
        }
        // judge: always FINAL_CANDIDATE
        return JUDGE_FINAL as T;
      },
    };
    const prompts: string[] = [];
    const config = await loadConfig(await writeConfig(dir, { observer: "command", maxIter: 5 }));
    const engine = new SetpointEngine(
      config,
      fakeDeps({ model, agent: fakeAgent(prompts), observer: fakeObserver(), cwd: dir }),
    );
    const result = await engine.run();
    expect(result.passed).toBe(true);
    // The jury-failure prompt (prompt #2) should contain the dissenting juror's reason.
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    expect(prompts[1]).toContain("not ready");
  });

  it("maximum iterations stops the loop with 'failed' phase", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sp-edge-maxiter-"));
    const model: StructuredModel = {
      async completeJson<T>(o: { schemaName: string }): Promise<T> {
        if (o.schemaName === "setpoint_north_star") return NORTH_STAR as T;
        return JUDGE_CONTINUE as T;
      },
    };
    const prompts: string[] = [];
    const config = await loadConfig(await writeConfig(dir, { observer: "command", maxIter: 3 }));
    const engine = new SetpointEngine(
      config,
      fakeDeps({ model, agent: fakeAgent(prompts), observer: fakeObserver(), cwd: dir }),
    );
    const result = await engine.run();
    expect(result.passed).toBe(false);
    expect(result.record.phase).toBe("failed");
    expect(result.record.final_reason).toContain("Maximum iterations");
  });

  it("maximum iterations stops the loop with 'failed' phase", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sp-edge-maxiter2-"));
    const model: StructuredModel = {
      async completeJson<T>(o: { schemaName: string }): Promise<T> {
        if (o.schemaName === "setpoint_north_star") return NORTH_STAR as T;
        return JUDGE_CONTINUE as T;
      },
    };
    const prompts: string[] = [];
    const config = await loadConfig(await writeConfig(dir, { observer: "command", maxIter: 2 }));
    const engine = new SetpointEngine(
      config,
      fakeDeps({ model, agent: fakeAgent(prompts), observer: fakeObserver(), cwd: dir }),
    );
    const result = await engine.run();
    expect(result.passed).toBe(false);
    expect(result.record.phase).toBe("failed");
    expect(result.record.iteration).toBe(2);
  });

  it(".setpoint/ already exists → storage reuses it without error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sp-edge-existing-"));
    await mkdir(join(dir, ".setpoint"));
    const storage = new RunStorage(".setpoint", dir);
    await storage.init();
    expect(storage.id).toBeTruthy();
    expect(storage.runDir).toContain(".setpoint");
  });

  it("rerunning in an existing project creates a NEW run (does not clobber previous)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sp-edge-rerun-"));
    const s1 = new RunStorage(".setpoint", dir);
    await s1.init();
    const id1 = s1.id;
    await s1.writeRun({ id: id1, phase: "done", iteration: 1, started_at: "x", updated_at: "x" });
    const s2 = new RunStorage(".setpoint", dir);
    await s2.init();
    expect(s2.id).not.toBe(id1);
    const latest = await RunStorage.readLatest(".setpoint", dir);
    expect(latest).toBeTruthy();
  });
});

/* ---------- helper ---------- */

async function writeConfig(
  dir: string,
  opts: { observer: "command" | "browser"; maxIter: number },
): Promise<string> {
  const path = join(dir, "setpoint.yaml");
  const lines = [
    "version: 1",
    "task: test task",
    "agent: { protocol: acp, command: node }",
    "models: { provider: openai, api_key_env: OPENAI_API_KEY }",
  ];
  if (opts.observer === "command") {
    lines.push("observer: { type: command, command: 'echo hi' }");
  } else {
    lines.push("observer: { type: browser, url: 'http://127.0.0.1:1' }");
  }
  lines.push(`autopilot: { max_iterations: ${opts.maxIter}, require_unanimous_jury: true }`);
  await writeFile(path, lines.join("\n"));
  return path;
}
