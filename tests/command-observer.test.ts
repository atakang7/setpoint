import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CommandObserver } from "../src/observer/command.js";
import { existsSync } from "node:fs";

describe("command observer (real run)", () => {
  it("starts, captures stdout/stderr, persists artifacts, and passes them to the judge path", async () => {
    // tiny fixture: a script that prints STATUS: unfinished
    const dir = await mkdtemp(join(tmpdir(), "setpoint-cmd-"));
    const scriptPath = join(dir, "status.sh");
    await writeFile(
      scriptPath,
      `#!/usr/bin/env bash
echo "STATUS: unfinished"
echo "to stderr" >&2
`,
      { mode: 0o755 },
    );

    const observer = new CommandObserver({
      command: "bash status.sh",
      timeoutMs: 5000,
      cwd: dir,
    });
    await observer.start();
    const outDir = join(dir, "run");
    await mkdir(outDir, { recursive: true });
    const observation = await observer.capture(1, outDir);
    await observer.close();

    expect(observation.kind).toBe("command");
    expect(observation.metadata.exit_code).toBe(0);
    expect(String(observation.metadata.stdout)).toContain("STATUS: unfinished");
    expect(String(observation.metadata.stderr)).toContain("to stderr");
    // artifact persisted
    expect(observation.artifacts.length).toBe(1);
    expect(existsSync(observation.artifacts[0])).toBe(true);
    const artifact = await readFile(observation.artifacts[0], "utf8");
    expect(artifact).toContain("$ bash status.sh");
    expect(artifact).toContain("--- stdout ---");
    expect(artifact).toContain("STATUS: unfinished");
    expect(artifact).toContain("--- stderr ---");
    expect(artifact).toContain("to stderr");
  });

  it("represents non-zero exits correctly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "setpoint-cmdfail-"));
    const scriptPath = join(dir, "fail.sh");
    await writeFile(
      scriptPath,
      `#!/usr/bin/env bash
echo "partial output"
echo "boom" >&2
exit 7
`,
      { mode: 0o755 },
    );

    const observer = new CommandObserver({ command: "bash fail.sh", timeoutMs: 5000, cwd: dir });
    await observer.start();
    const observation = await observer.capture(1, join(dir, "run"));
    await observer.close();

    expect(observation.metadata.exit_code).toBe(7);
    expect(String(observation.metadata.stdout)).toContain("partial output");
    expect(String(observation.metadata.stderr)).toContain("boom");
  });

  it("enforces the timeout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "setpoint-timeout-"));
    const scriptPath = join(dir, "slow.sh");
    await writeFile(
      scriptPath,
      `#!/usr/bin/env bash
echo "starting"
sleep 5
echo "done"
`,
      { mode: 0o755 },
    );

    const observer = new CommandObserver({ command: "bash slow.sh", timeoutMs: 200, cwd: dir });
    await observer.start();
    const start = Date.now();
    const observation = await observer.capture(1, join(dir, "run"));
    const elapsed = Date.now() - start;
    await observer.close();

    // should fail well under the 5s sleep
    expect(elapsed).toBeLessThan(2000);
    expect(observation.metadata.exit_code).not.toBe(0);
    expect(observation.summary).toContain("exited with code");
  });

  it("captures changing observable state across iterations", async () => {
    // fixture whose observable result flips from unfinished to finished
    const dir = await mkdtemp(join(tmpdir(), "setpoint-flip-"));
    const flagPath = join(dir, "flag");
    await writeFile(flagPath, "unfinished");
    const scriptPath = join(dir, "status.sh");
    await writeFile(
      scriptPath,
      `#!/usr/bin/env bash
cat "${flagPath}"
`,
      { mode: 0o755 },
    );

    const observer = new CommandObserver({ command: "bash status.sh", timeoutMs: 5000, cwd: dir });
    await observer.start();
    const runDir = join(dir, "run");

    const obs1 = await observer.capture(1, runDir);
    expect(String(obs1.metadata.stdout)).toContain("unfinished");

    // the "coding agent" flips the flag
    await writeFile(flagPath, "STATUS: finished");

    const obs2 = await observer.capture(2, runDir);
    expect(String(obs2.metadata.stdout)).toContain("STATUS: finished");
    await observer.close();
  });
});
