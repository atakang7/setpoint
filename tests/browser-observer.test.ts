import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { BrowserObserver } from "../src/observer/browser.js";

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Orbit Landing</title></head>
<body>
  <h1>Orbit</h1>
  <p>A fictional developer tool.</p>
  <button>Get started</button>
</body>
</html>`;

describe("browser observer (real run)", () => {
  it("starts the dev server, waits for the URL, launches Chromium, captures desktop + mobile, stores screenshots", async () => {
    const dir = await mkdtemp(join(tmpdir(), "setpoint-browser-"));
    const htmlPath = join(dir, "index.html");
    await writeFile(htmlPath, FIXTURE_HTML);

    const port = 4317 + Math.floor(Math.random() * 200);
    const url = `http://127.0.0.1:${port}`;
    const startCommand = `node -e "require('node:http').createServer((q,s)=>{s.writeHead(200,{'Content-Type':'text/html'});s.end(require('node:fs').readFileSync('${htmlPath.replace(/'/g, "\\'")}'))}).listen(${port},'127.0.0.1')"`;

    const observer = new BrowserObserver({
      url,
      startCommand,
      readyTimeoutMs: 8000,
      fullPage: true,
      viewports: [
        { width: 1280, height: 800 },
        { width: 390, height: 844 },
      ],
      cwd: dir,
    });

    await observer.start();
    const runDir = join(dir, "run");
    await mkdir(runDir, { recursive: true });
    const observation = await observer.capture(1, runDir);
    await observer.close();

    expect(observation.kind).toBe("browser");
    expect(observation.summary).toContain("2 browser view");
    expect(observation.artifacts.length).toBe(2);
    for (const artifact of observation.artifacts) {
      expect(existsSync(artifact)).toBe(true);
    }
    // screenshots are named by viewport
    expect(observation.artifacts[0]).toContain("1280x800");
    expect(observation.artifacts[1]).toContain("390x844");
    // metadata captures body text + title
    const captures = observation.metadata.captures as Array<Record<string, unknown>>;
    expect(captures.length).toBe(2);
    expect(captures[0].title).toBe("Orbit Landing");
    expect(String(captures[0].body_text)).toContain("Orbit");
  }, 30000);

  it("honors full-page behavior", async () => {
    const tallHtml = `<!DOCTYPE html><html><head><title>Tall</title></head>
<body>${"<div style='height:200px;border:1px solid red'>block</div>".repeat(40)}</body></html>`;
    const dir = await mkdtemp(join(tmpdir(), "setpoint-fullpage-"));
    const htmlPath = join(dir, "index.html");
    await writeFile(htmlPath, tallHtml);
    const port = 4517 + Math.floor(Math.random() * 200);
    const url = `http://127.0.0.1:${port}`;
    const startCommand = `node -e "require('node:http').createServer((q,s)=>{s.writeHead(200,{'Content-Type':'text/html'});s.end(require('node:fs').readFileSync('${htmlPath.replace(/'/g, "\\'")}'))}).listen(${port},'127.0.0.1')"`;

    const fullObserver = new BrowserObserver({
      url,
      startCommand,
      readyTimeoutMs: 8000,
      fullPage: true,
      viewports: [{ width: 800, height: 600 }],
      cwd: dir,
    });
    await fullObserver.start();
    const obsFull = await fullObserver.capture(1, join(dir, "run"));
    await fullObserver.close();
    const fullShot = await import("node:fs/promises").then((m) => m.readFile(obsFull.artifacts[0]));

    const partialObserver = new BrowserObserver({
      url,
      startCommand,
      readyTimeoutMs: 8000,
      fullPage: false,
      viewports: [{ width: 800, height: 600 }],
      cwd: dir,
    });
    await partialObserver.start();
    const obsPartial = await partialObserver.capture(2, join(dir, "run"));
    await partialObserver.close();
    const partialShot = await import("node:fs/promises").then((m) =>
      m.readFile(obsPartial.artifacts[0]),
    );

    // full-page screenshot should be larger (taller) than the viewport-only one
    expect(fullShot.length).toBeGreaterThan(partialShot.length);
  }, 30000);

  it("gives a useful error when the URL never becomes available", async () => {
    const dir = await mkdtemp(join(tmpdir(), "setpoint-nourl-"));
    const observer = new BrowserObserver({
      url: "http://127.0.0.1:65500",
      startCommand: undefined,
      readyTimeoutMs: 600,
      fullPage: true,
      viewports: [{ width: 800, height: 600 }],
      cwd: dir,
    });
    await expect(observer.start()).rejects.toThrow(/did not become ready/);
  });

  it("passes screenshots into the judgment path (image artifacts are image-type)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "setpoint-judge-"));
    const htmlPath = join(dir, "index.html");
    await writeFile(htmlPath, FIXTURE_HTML);
    const port = 4717 + Math.floor(Math.random() * 200);
    const url = `http://127.0.0.1:${port}`;
    const startCommand = `node -e "require('node:http').createServer((q,s)=>{s.writeHead(200,{'Content-Type':'text/html'});s.end(require('node:fs').readFileSync('${htmlPath.replace(/'/g, "\\'")}'))}).listen(${port},'127.0.0.1')"`;
    const observer = new BrowserObserver({
      url,
      startCommand,
      readyTimeoutMs: 8000,
      fullPage: true,
      viewports: [{ width: 1280, height: 800 }],
      cwd: dir,
    });
    await observer.start();
    const observation = await observer.capture(1, join(dir, "run"));
    await observer.close();
    // engine's imageArtifacts() filters for png/jpg/jpeg/webp
    const imageArtifacts = observation.artifacts.filter((p) =>
      [".png", ".jpg", ".jpeg", ".webp"].includes(p.slice(-4).toLowerCase()),
    );
    expect(imageArtifacts.length).toBe(1);
  }, 30000);

  it("cleans up browser/server processes correctly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "setpoint-cleanup-"));
    const htmlPath = join(dir, "index.html");
    await writeFile(htmlPath, FIXTURE_HTML);
    const port = 4917 + Math.floor(Math.random() * 200);
    const url = `http://127.0.0.1:${port}`;
    const startCommand = `node -e "require('node:http').createServer((q,s)=>{s.writeHead(200,{'Content-Type':'text/html'});s.end(require('node:fs').readFileSync('${htmlPath.replace(/'/g, "\\'")}'))}).listen(${port},'127.0.0.1')"`;
    const observer = new BrowserObserver({
      url,
      startCommand,
      readyTimeoutMs: 8000,
      fullPage: true,
      viewports: [{ width: 1280, height: 800 }],
      cwd: dir,
    });
    await observer.start();
    await observer.capture(1, join(dir, "run"));
    await observer.close();
    // server port should be released shortly after close
    await new Promise((r) => setTimeout(r, 300));
    const probe = await fetch(url).catch((e) => e);
    expect(probe).toBeInstanceOf(Error); // connection refused
  }, 30000);
});
