import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import type { Observation, Observer } from "../types.js";

export class BrowserObserver implements Observer {
  private server?: ChildProcess;
  constructor(
    private readonly options: {
      url: string;
      startCommand?: string;
      readyTimeoutMs: number;
      fullPage: boolean;
      viewports: Array<{ width: number; height: number }>;
      cwd: string;
    },
  ) {}
  async start(): Promise<void> {
    if (this.options.startCommand) {
      this.server = spawn(this.options.startCommand, {
        cwd: this.options.cwd,
        shell: true,
        stdio: "inherit",
        env: process.env,
        detached: process.platform !== "win32",
      });
      // Spawn failures must be handled, even when URL polling is in progress.
      this.server.on("error", (error) => {
        console.warn("Observer dev server failed:", error.message);
      });
    }
    try {
      await waitForUrl(this.options.url, this.options.readyTimeoutMs);
    } catch (error) {
      // Engine doesn't mark the observer started until this method succeeds.
      // Therefore failed startup must clean up its own child process group.
      await this.close();
      throw error;
    }
  }
  async capture(iteration: number, outputDir: string): Promise<Observation> {
    const dir = join(outputDir, `observation-${String(iteration).padStart(3, "0")}`);
    await mkdir(dir, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const artifacts: string[] = [];
    const captures: Array<Record<string, unknown>> = [];
    try {
      for (const viewport of this.options.viewports) {
        const page = await browser.newPage({ viewport });
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.goto(this.options.url, { waitUntil: "load", timeout: 30_000 });
        const title = await page.title();
        const bodyText = (await page.locator("body").innerText()).slice(0, 12_000);
        const path = join(dir, `${viewport.width}x${viewport.height}.png`);
        await page.screenshot({ path, fullPage: this.options.fullPage });
        artifacts.push(path);
        captures.push({
          viewport,
          title,
          body_text: bodyText,
          console_errors: consoleErrors,
          page_errors: pageErrors,
        });
        await page.close();
      }
    } finally {
      await browser.close();
    }
    await writeFile(join(dir, "metadata.json"), `${JSON.stringify(captures, null, 2)}\n`, "utf8");
    return {
      kind: "browser",
      summary: `Captured ${artifacts.length} browser view(s) from ${this.options.url}.`,
      artifacts,
      metadata: { url: this.options.url, captures },
    };
  }
  async close(): Promise<void> {
    const child = this.server;
    this.server = undefined;
    if (!child) return;
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      // Process (or group) exited before cleanup.
    }
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([
        new Promise<void>((resolve) => child.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
    }
    if (child.exitCode === null && child.signalCode === null) {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        // Already exited.
      }
    }
  }
}
async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const remaining = deadline - Date.now();
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(Math.max(1, Math.min(3000, remaining))),
      });
      if (response.ok) {
        await response.body?.cancel();
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Observer URL did not become ready within ${timeoutMs}ms: ${url}. Last error: ${String(lastError)}`,
  );
}
