import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { SetpointEngine } from "../src/engine.js";
import { RunStorage } from "../src/storage.js";
import { CommandObserver } from "../src/observer/command.js";
import { AcpCodingAgent } from "../src/agent/acp.js";
import type { Judgment, JuryVerdict, NorthStar, StructuredModel } from "../src/types.js";
import type { SetpointConfig } from "../src/config.js";

const FIXTURE_DIR = join(import.meta.dirname, "fixtures");
const WRITER_AGENT = join(FIXTURE_DIR, "fake-acp-writer.mjs");

// A scripted model that drives the loop deterministically:
// North Star → fixed. Judge → CONTINUE twice, FINAL_CANDIDATE, then jury FAIL, then on next final-candidate jury → 3 PASS.
function fakeModel(): StructuredModel {
  let judgeCount = 0;
  let juryCount = 0;
  const northStar: NorthStar = {
    vision: "A tiny script whose observable output says STATUS: finished.",
    experience: ["running it prints STATUS: finished"],
    quality_bar: "the literal text STATUS: finished",
    avoid: ["STATUS: unfinished"],
    guidance: {
      reasoning: "none needed",
      recommendations: [],
      strength: "light",
    },
  };
  return {
    async completeJson<T>(opts: { model: string; prompt: string; schemaName: string }): Promise<T> {
      if (opts.schemaName === "setpoint_north_star") return northStar as unknown as T;
      if (opts.schemaName === "setpoint_progress_judgment") {
        judgeCount += 1;
        let verdict: Judgment;
        if (judgeCount <= 2) {
          verdict = {
            verdict: "CONTINUE",
            assessment: `judge#${judgeCount}: still unfinished`,
            critical_gaps: ["output still says unfinished"],
            next_direction: "make it say finished",
            confidence: 0.6,
          };
        } else {
          verdict = {
            verdict: "FINAL_CANDIDATE",
            assessment: `judge#${judgeCount}: looks finished now`,
            critical_gaps: [],
            next_direction: "send to jury",
            confidence: 0.8,
          };
        }
        return verdict as unknown as T;
      }
      // jury
      juryCount += 1;
      // First jury (juryCount 1-3): one FAIL. Second jury (4-6): all PASS.
      const firstJury = juryCount <= 3;
      const verdict: JuryVerdict =
        firstJury && juryCount === 1
          ? { verdict: "FAIL", reason: "not yet", critical_gaps: ["no"] }
          : { verdict: "PASS", reason: "good", critical_gaps: [] };
      return verdict as unknown as T;
    },
  };
}

describe("full autonomous loop (real engine + real ACP + real command observer)", () => {
  it("runs define → code → observe → judge CONTINUE ×2 → FINAL_CANDIDATE → jury FAIL → code → FINAL_CANDIDATE → jury 3 PASS → DONE", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-e2e-"));
    const storage = new RunStorage(cwd, "run-e2e");
    const config: SetpointConfig = {
      task: "make output.txt say STATUS: finished",
      models: { ideal_definer: "fake-ns", judge: "fake-judge", jury: ["j1", "j2", "j3"] },
      autopilot: { max_iterations: 10, require_unanimous_jury: true },
      observe: {
        kind: "command",
        command: "cat output.txt",
        timeout_ms: 5000,
        full_page: true,
        url: "",
        start_command: "",
        ready_timeout_ms: 5000,
        viewports: [],
      },
      prompts: { ideal_definer: "", coder: "", judge: "", jury: "" },
    };
    const events: string[] = [];
    const engine = new SetpointEngine(config, {
      model: fakeModel(),
      agent: new AcpCodingAgent({
        command: "node",
        args: [WRITER_AGENT],
        permissions: "auto-allow",
      }),
      observer: new CommandObserver({
        command: "cat output.txt",
        timeoutMs: 5000,
        cwd,
      }),
      storage,
      cwd,
      onEvent: (m) => events.push(m),
    });

    const result = await engine.run();

    // 1. North Star ran exactly once → only one north-star.json
    expect(existsSync(join(storage.runDir, "north-star.json"))).toBe(true);
    expect(readdirSync(join(storage.runDir)).filter((f) => f === "north-star.json").length).toBe(1);

    // 2. North Star remains identical (read it, compare to what model returns)
    const ns = JSON.parse(readFileSync(join(storage.runDir, "north-star.json"), "utf8"));
    expect(ns.vision).toContain("STATUS: finished");
    expect(ns.avoid).toContain("STATUS: unfinished");

    // 9. Three successful jury votes terminate → passed
    expect(result.passed).toBe(true);
    expect(result.record.phase).toBe("done");
    expect(result.record.agent_session_id).toMatch(/^sess-1$/);

    // 3. Same coder session received continuation prompts (single session id)
    // (the fake writer only ever creates one session per process)
    expect(result.record.agent_session_id).toBe("sess-1");

    // 4. Observer ran after every coder stop → observations/001..004 exist
    const obs = readdirSync(join(storage.runDir, "observations")).sort();
    expect(obs.length).toBeGreaterThanOrEqual(4);
    expect(obs[0]).toBe("001.json");

    // 5/6/7/8: judge CONTINUE → resume; FINAL_CANDIDATE → jury; jury FAIL → resume
    const judgments = readdirSync(join(storage.runDir, "judgments")).sort();
    const jFiles = judgments.map((f) =>
      JSON.parse(readFileSync(join(storage.runDir, "judgments", f), "utf8")),
    );
    expect(jFiles[0].verdict).toBe("CONTINUE");
    expect(jFiles[1].verdict).toBe("CONTINUE");
    expect(jFiles[2].verdict).toBe("FINAL_CANDIDATE");
    expect(jFiles[3].verdict).toBe("FINAL_CANDIDATE");

    // 10. progress judge cannot PASS (schema enforces, but confirm no PASS in judgments)
    expect(jFiles.every((j) => j.verdict !== "PASS")).toBe(true);

    // 11. run record persisted with all phases
    const run = JSON.parse(readFileSync(join(storage.runDir, "run.json"), "utf8"));
    expect(run.phase).toBe("done");
    expect(run.iteration).toBeGreaterThanOrEqual(4);
    expect(run.agent_session_id).toBe("sess-1");
    expect(run.north_star_path).toBeTruthy();
    expect(run.last_observation_path).toBeTruthy();
    expect(run.final_reason).toBeTruthy();

    // jury files: two juries (one FAIL, one all PASS)
    const juries = readdirSync(join(storage.runDir, "jury")).sort();
    expect(juries.length).toBe(2);
    const firstJury = JSON.parse(readFileSync(join(storage.runDir, "jury", juries[0]), "utf8"));
    const firstVerdicts = firstJury.map((v: { verdict: string }) => v.verdict);
    expect(firstVerdicts).toContain("FAIL");
    const secondJury = JSON.parse(readFileSync(join(storage.runDir, "jury", juries[1]), "utf8"));
    expect(secondJury.every((v: { verdict: string }) => v.verdict === "PASS")).toBe(true);

    // event log shows the full arc
    expect(events.some((e) => e.startsWith("DEFINE"))).toBe(true);
    expect(events.some((e) => e.includes("CONTINUE"))).toBe(true);
    expect(events.some((e) => e.includes("Final candidate"))).toBe(true);
    expect(events.some((e) => e.includes("JURY    FAIL"))).toBe(true);
    expect(events.some((e) => e.startsWith("PASS"))).toBe(true);
  }, 30000);

  it("stops runaway loops at max_iterations", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-e2e-max-"));
    const storage = new RunStorage(cwd, "run-max");
    const config: SetpointConfig = {
      task: "never finishes",
      models: { ideal_definer: "fake-ns", judge: "fake-judge", jury: ["j1", "j2", "j3"] },
      autopilot: { max_iterations: 2, require_unanimous_jury: true },
      observe: {
        kind: "command",
        command: "cat output.txt",
        timeout_ms: 5000,
        full_page: true,
        url: "",
        start_command: "",
        ready_timeout_ms: 5000,
        viewports: [],
      },
      prompts: { ideal_definer: "", coder: "", judge: "", jury: "" },
    };
    // judge always CONTINUE → never reaches FINAL_CANDIDATE → max iterations
    const model: StructuredModel = {
      async completeJson<T>(opts: {
        model: string;
        prompt: string;
        schemaName: string;
      }): Promise<T> {
        if (opts.schemaName === "setpoint_north_star") {
          return {
            vision: "x",
            experience: ["x"],
            quality_bar: "x",
            avoid: ["x"],
            guidance: { reasoning: "", recommendations: [], strength: "light" },
          } as unknown as T;
        }
        return {
          verdict: "CONTINUE",
          assessment: "nope",
          critical_gaps: ["x"],
          next_direction: "x",
          confidence: 0.1,
        } as unknown as T;
      },
    };
    const engine = new SetpointEngine(config, {
      model,
      agent: new AcpCodingAgent({
        command: "node",
        args: [WRITER_AGENT],
        permissions: "auto-allow",
      }),
      observer: new CommandObserver({ command: "cat output.txt", timeoutMs: 5000, cwd }),
      storage,
      cwd,
    });
    const result = await engine.run();
    expect(result.passed).toBe(false);
    expect(result.record.phase).toBe("failed");
    expect(result.record.final_reason).toContain("Maximum iterations");
  }, 30000);
});
