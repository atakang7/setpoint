import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createRuntime } from "../src/factory.js";
import { SetpointEngine } from "../src/engine.js";

const CORTEX_BIN = "/tmp/cortex-bin";

describe("Setpoint + Cortex integration (no OpenAI key)", () => {
  it("runs the full engine loop with Cortex as both coder and structured model", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-cortex-e2e-"));

    // A trivial command observer: echo a fixed status.
    // We use a script that writes "STATUS: finished" so the judge/jury
    // can evaluate it against the north star.
    const observerScript = join(cwd, "observe.sh");
    await writeFile(observerScript, "#!/bin/bash\necho 'STATUS: finished'\n");
    await writeFile(`${observerScript}`, "#!/bin/bash\necho 'STATUS: finished'\n", { mode: 0o755 });

    const configYaml = [
      "version: 1",
      `task: Create a one-page README.md with the project title and a short description.`,
      `agent:`,
      `  protocol: acp`,
      `  command: ${CORTEX_BIN}`,
      `  args: ["--acp"]`,
      `  permissions: auto-allow`,
      `models:`,
      `  provider: agent`,
      `  ideal_definer: default`,
      `  judge: default`,
      `  jury: [default]`,
      `observer:`,
      `  type: command`,
      `  command: "bash -c 'echo STATUS: finished'"`,
      `  timeout_ms: 5000`,
      `autopilot:`,
      `  max_iterations: 1`,
      `  require_unanimous_jury: true`,
      `prompts:`,
      `  ideal_definer: ""`,
      `  coder: ""`,
      `  judge: ""`,
      `  jury: ""`,
    ].join("\n");

    const configPath = join(cwd, "setpoint.yaml");
    await writeFile(configPath, configYaml);

    // Ensure no OPENAI_API_KEY is set for this test.
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const config = await loadConfig(configPath);
      expect(config.models.provider).toBe("agent");
      expect(config.agent.command).toBe(CORTEX_BIN);

      const runtime = createRuntime(config, cwd);
      const events: string[] = [];
      const engine = new SetpointEngine(config, {
        model: runtime.model,
        agent: runtime.agent,
        observer: runtime.observer,
        storage: runtime.storage,
        cwd: runtime.cwd,
        onEvent: (msg) => events.push(msg),
      });

      const result = await engine.run().catch((err) => {
        // If it fails, we still want to see how far it got.
        events.push(`ERROR: ${err}`);
        return null;
      });

      // The engine should at least get past the DEFINE phase.
      // We don't require a PASS (Cortex may not return perfect JSON),
      // but we require that it DID NOT fail for missing OPENAI_API_KEY.
      const keyError = events.find((e) => e.includes("OPENAI_API_KEY"));
      expect(keyError).toBeUndefined();

      // It should have started the DEFINE phase at minimum.
      expect(events.some((e) => e.includes("DEFINE"))).toBe(true);

      if (result) {
        // If it completed, it should have a north star.
        expect(result.northStar).toBeDefined();
        expect(result.northStar.vision).toBeTruthy();
      }
    } finally {
      if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
    }
  }, 300000); // 5 min timeout — real LLM calls
});
