import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SetpointConfig } from "../src/config.js";
import { formatRunSnapshot, loadRunSnapshot } from "../src/inspect.js";
import { RunStorage } from "../src/storage.js";
import type { NorthStar, Observation, RunRecord } from "../src/types.js";

const CONFIG: SetpointConfig = {
  version: 1,
  task: "Build the product.",
  agent: {
    protocol: "acp",
    command: "cortex",
    args: ["--acp"],
    env: {},
    permissions: "auto-allow",
  },
  models: {
    provider: "agent",
    env: {},
    permissions: "deny",
    ideal_definer: "default",
    judge: "codex",
    jury: ["codex", "codex", "codex"],
    profiles: {},
  },
  observer: { type: "command", command: "echo ok", timeout_ms: 60_000 },
  prompts: {},
  autopilot: { max_iterations: 10, require_unanimous_jury: true },
  run_dir: ".setpoint",
};

const NORTH_STAR: NorthStar = {
  vision: "A serious desktop-class product.",
  experience: ["Clear and responsive"],
  quality_bar: "Ready for expert users.",
  avoid: ["generic template"],
  guidance: { reasoning: "", recommendations: [], strength: "light" },
};

const OBSERVATION: Observation = {
  kind: "browser",
  summary: "Captured desktop and mobile.",
  artifacts: ["/tmp/fake/1440x1000.png", "/tmp/fake/390x844.png"],
  metadata: {},
};

describe("run inspection", () => {
  it("reconstructs turns, observations, judgments, and jury from persisted state", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-inspect-"));
    const storage = new RunStorage(".setpoint", cwd, "run-test");
    await storage.init();

    const northStarPath = await storage.writeJson("north-star.json", NORTH_STAR);
    await storage.writeJson("turns/001.json", { stopReason: "end_turn", text: "done" });
    const observationPath = await storage.writeJson("observations/001.json", OBSERVATION);
    const judgmentPath = await storage.writeJson("judgments/001.json", {
      verdict: "CONTINUE",
      assessment: "The hierarchy is still weak.",
      critical_gaps: ["selection is unclear"],
      next_direction: "Make the interaction hierarchy unmistakable.",
      confidence: 0.91,
    });
    await storage.writeJson("jury/001.json", [
      { verdict: "FAIL", reason: "Needs another pass.", critical_gaps: ["hierarchy"] },
    ]);

    const record: RunRecord = {
      id: "run-test",
      phase: "coding",
      iteration: 1,
      started_at: "2026-08-25T00:00:00.000Z",
      updated_at: "2026-08-25T00:01:00.000Z",
      agent_session_id: "cortex-1",
      north_star_path: northStarPath,
      last_observation_path: observationPath,
      last_judgment_path: judgmentPath,
    };
    await storage.writeRun(record);

    const snapshot = await loadRunSnapshot(".setpoint", cwd);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.record.agent_session_id).toBe("cortex-1");
    expect(snapshot?.northStar?.vision).toContain("desktop-class");
    expect(snapshot?.iterations[0]?.turn?.stopReason).toBe("end_turn");
    expect(snapshot?.iterations[0]?.observation?.artifacts).toHaveLength(2);
    expect(snapshot?.iterations[0]?.judgment?.verdict).toBe("CONTINUE");
    expect(snapshot?.iterations[0]?.jury?.[0]?.verdict).toBe("FAIL");

    const text = formatRunSnapshot(snapshot!, CONFIG);
    expect(text).toContain("cortex-1");
    expect(text).toContain("CONTINUE");
    expect(text).toContain("Make the interaction hierarchy unmistakable.");
    expect(text).toContain("0/1 PASS");
  });

  it("returns null when no run exists", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-inspect-empty-"));
    await expect(loadRunSnapshot(".setpoint", cwd)).resolves.toBeNull();
  });
});
