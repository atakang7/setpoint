import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Observation, Observer } from "../types.js";
const execAsync = promisify(exec);
export class CommandObserver implements Observer {
  constructor(private readonly options: { command: string; timeoutMs: number; cwd: string }) {}
  async start(): Promise<void> {}
  async capture(iteration: number, outputDir: string): Promise<Observation> {
    const dir = join(outputDir, `observation-${String(iteration).padStart(3, "0")}`); await mkdir(dir, { recursive: true });
    let stdout = "", stderr = "", exitCode = 0;
    try {
      const result = await execAsync(this.options.command, { cwd: this.options.cwd, timeout: this.options.timeoutMs, maxBuffer: 10 * 1024 * 1024 });
      stdout = result.stdout; stderr = result.stderr;
    } catch (error: any) {
      stdout = error.stdout ?? ""; stderr = error.stderr ?? String(error); exitCode = typeof error.code === "number" ? error.code : 1;
    }
    const artifact = join(dir, "command.txt");
    await writeFile(artifact, `$ ${this.options.command}\n\n--- stdout ---\n${stdout}\n\n--- stderr ---\n${stderr}\n`, "utf8");
    return { kind: "command", summary: `Command observer exited with code ${exitCode}.`, artifacts: [artifact], metadata: { command: this.options.command, exit_code: exitCode, stdout: stdout.slice(0, 20_000), stderr: stderr.slice(0, 20_000) } };
  }
  async close(): Promise<void> {}
}
