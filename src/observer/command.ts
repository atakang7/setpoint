import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Observation, Observer } from "../types.js";

const MAX_CAPTURE_CHARS = 10 * 1024 * 1024;

function stopProcessGroup(child: ChildProcess): void {
  try {
    // The spawned shell and all ordinary descendants share a new process
    // group on POSIX. Killing just the shell leaks processes like "sleep".
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {
    // Already exited.
  }
}

export class CommandObserver implements Observer {
  private active?: ChildProcess;
  constructor(private readonly options: { command: string; timeoutMs: number; cwd: string }) {}

  async start(): Promise<void> {}

  async capture(iteration: number, outputDir: string): Promise<Observation> {
    const dir = join(outputDir, `observation-${String(iteration).padStart(3, "0")}`);
    await mkdir(dir, { recursive: true });
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    let timedOut = false;

    const child = spawn(this.options.command, {
      cwd: this.options.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    this.active = child;

    const append = (existing: string, chunk: Buffer) =>
      existing.length >= MAX_CAPTURE_CHARS
        ? existing
        : existing + chunk.toString("utf8").slice(0, MAX_CAPTURE_CHARS - existing.length);

    const timer = setTimeout(() => {
      timedOut = true;
      stopProcessGroup(child);
    }, this.options.timeoutMs);
    try {
      await new Promise<void>((resolve) => {
        child.stdout?.on("data", (chunk: Buffer) => {
          stdout = append(stdout, chunk);
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr = append(stderr, chunk);
        });
        child.on("error", (error) => {
          stderr = append(stderr, Buffer.from(error.message));
        });
        child.on("close", (code) => {
          exitCode = timedOut ? 124 : (code ?? 1);
          resolve();
        });
      });
    } finally {
      clearTimeout(timer);
      if (this.active === child) this.active = undefined;
    }

    const artifact = join(dir, "command.txt");
    await writeFile(
      artifact,
      `$ ${this.options.command}\n\n--- stdout ---\n${stdout}\n\n--- stderr ---\n${stderr}\n`,
      "utf8",
    );
    return {
      kind: "command",
      summary: `Command observer exited with code ${exitCode}${timedOut ? " (timeout)" : ""}.`,
      artifacts: [artifact],
      metadata: {
        command: this.options.command,
        exit_code: exitCode,
        timed_out: timedOut,
        stdout: stdout.slice(0, 20_000),
        stderr: stderr.slice(0, 20_000),
      },
    };
  }

  async close(): Promise<void> {
    if (this.active) {
      stopProcessGroup(this.active);
      this.active = undefined;
    }
  }
}
