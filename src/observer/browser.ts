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
    if (this.options.startCommand)
      this.server = spawn(this.options.startCommand, {
        cwd: this.options.cwd,
        shell: true,
        stdio: "inherit",
        env: process.env,
        detached: true,
      });
    await waitForUrl(this.options.url, this.options.readyTimeoutMs);
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
        await page.goto(this.options.url, { waitUntil: "networkidle" });
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
    if (this.server && !this.server.killed) {
      try {
        if (this.server.pid) process.kill(-this.server.pid, "SIGTERM");
        else this.server.kill("SIGTERM");
      } catch {
        this.server.kill("SIGTERM");
      }
    }
  }
}
async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Observer URL did not become ready within ${timeoutMs}ms: ${url}. Last error: ${String(lastError)}`,
  );
}
