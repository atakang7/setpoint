import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BrowserObserver } from "../src/observer/browser.js";
import { CommandObserver } from "../src/observer/command.js";

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = address && typeof address !== "string" ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("observer failure boundaries", () => {
  it("rejects HTTP 404 as unready and stops the launched server", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-unready-"));
    const port = await unusedPort();
    const url = `http://127.0.0.1:${port}`;
    const startCommand = `node -e "require('node:http').createServer((q,s)=>{s.writeHead(404);s.end('not ready')}).listen(${port},'127.0.0.1')"`;
    const observer = new BrowserObserver({
      cwd,
      url,
      startCommand,
      readyTimeoutMs: 1100,
      fullPage: false,
      viewports: [{ width: 800, height: 600 }],
    });

    await expect(observer.start()).rejects.toThrow(/did not become ready/);
    // start() must clean its own child: engine.close() is never called on
    // an observer whose startup promise rejects.
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(fetch(url)).rejects.toThrow();
  }, 10_000);

  it("bounds a server that hangs without sending response headers", async () => {
    const server = createServer(() => {
      // Intentionally no response.
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = address && typeof address !== "string" ? address.port : 0;
    const observer = new BrowserObserver({
      cwd: process.cwd(),
      url: `http://127.0.0.1:${port}`,
      readyTimeoutMs: 600,
      fullPage: false,
      viewports: [{ width: 800, height: 600 }],
    });
    const started = Date.now();
    try {
      await expect(observer.start()).rejects.toThrow(/did not become ready/);
      expect(Date.now() - started).toBeLessThan(2500);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 8_000);

  it("kills a timed-out command's child server, not only its shell", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-timeout-child-"));
    const port = await unusedPort();
    const url = `http://127.0.0.1:${port}`;
    const command = `node -e "require('node:http').createServer((q,s)=>s.end('alive')).listen(${port},'127.0.0.1',()=>console.log('READY'))"`;
    const observer = new CommandObserver({ cwd, command, timeoutMs: 1000 });
    const observation = await observer.capture(1, join(cwd, "runs"));
    expect(observation.metadata.exit_code).toBe(124);
    expect(observation.metadata.timed_out).toBe(true);
    expect(observation.metadata.stdout).toContain("READY");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(fetch(url)).rejects.toThrow();
  }, 8_000);
});
