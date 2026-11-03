import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initConfig, loadConfig } from "../src/config.js";

describe("config", () => {
  it("initializes and parses the default config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "setpoint-config-"));
    const path = join(dir, "setpoint.yaml");
    expect(await initConfig(path)).toBe("created");
    expect(await initConfig(path)).toBe("exists");
    const text = await readFile(path, "utf8");
    expect(text).toContain("task:");
    const config = await loadConfig(path);
    expect(config.version).toBe(1);
    expect(config.agent.protocol).toBe("acp");
    expect(config.autopilot.max_iterations).toBe(20);
  });
});
