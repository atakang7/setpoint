import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const cwd = process.cwd();
const dir = await mkdtemp(join(tmpdir(), "setpoint-ui-e2e-"));
const stateRoot = join(dir, ".setpoint");
const runDir = join(stateRoot, "runs", "visual-fixture");
const shotDir = join(runDir, "observation-001");
const evidenceDir = resolve("browser-evidence");
await mkdir(shotDir, { recursive: true });
await mkdir(evidenceDir, { recursive: true });
await writeFile(join(stateRoot, "latest"), "visual-fixture\n");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7gzioAAAAASUVORK5CYII=",
  "base64",
);
const screenshotPath = join(shotDir, "1440x1000.png");
await writeFile(screenshotPath, png);
// Render a real Chromium screenshot as the observation fixture. This is not
// a production deployment or synthetic pass metric.
const fixtureBrowser = await chromium.launch({ headless: true });
try {
  const fixturePage = await fixtureBrowser.newPage({ viewport: { width: 1440, height: 900 } });
  await fixturePage.setContent(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><style>\n*{box-sizing:border-box}body{margin:0;padding:60px 76px;background:#f5f7fa;color:#153046;font:22px/1.5 system-ui,Arial}\nheader{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #d5dfe8;padding-bottom:24px;margin-bottom:80px}\nheader b{font-size:23px}header small{font-size:16px;color:#577287}\n.label{font-size:16px;text-transform:uppercase;letter-spacing:.14em;color:#138074;font-weight:750}\nh1{font-size:64px;letter-spacing:-.045em;line-height:1.05;margin:20px 0}\np{color:#60798b;max-width:640px}\n.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:68px}\n.metric{padding:28px;background:#fff;border:1px solid #dae3e9;border-radius:12px}\n.metric span{display:block;color:#60798b;font-size:17px}.metric strong{display:block;font-size:43px;margin:10px 0}\n.metric em{font-size:16px;font-style:normal;color:#138074}\n</style></head><body>\n<header><b>Runtime Operations</b><small>SETPOINT / VISUAL TEST FIXTURE</small></header>\n<div class="label">Product observation</div>\n<h1>Infrastructure at a glance.</h1>\n<p>A rendered browser fixture used to validate Setpointâs screenshot capture, artifact isolation, and judgment dashboard.</p>\n<div class="metrics">\n<div class="metric"><span>Service health</span><strong>Healthy</strong><em>All checks green</em></div>\n<div class="metric"><span>Active services</span><strong>12</strong><em>Reference fixture</em></div>\n<div class="metric"><span>Current deployment</span><strong>v1.0</strong><em>Fixture only</em></div>\n</div></body></html>',
  );
  await fixturePage.screenshot({ path: screenshotPath, fullPage: true });
} finally {
  await fixtureBrowser.close();
}
const outsidePath = join(dir, "secret.png");
await writeFile(outsidePath, png);
const linkedPath = join(shotDir, "linked-secret.png");
await symlink(outsidePath, linkedPath);

const now = new Date().toISOString();
await writeFile(
  join(runDir, "run.json"),
  JSON.stringify({
    id: "visual-fixture",
    phase: "done",
    iteration: 1,
    started_at: now,
    updated_at: now,
    final_reason: "All observed conditions satisfied",
  }),
);
await writeFile(
  join(runDir, "north-star.json"),
  JSON.stringify({
    vision: "A working developer dashboard",
    quality_bar: "Shows real test evidence",
    experience: ["Clear progress"],
    avoid: ["Broken layout"],
    guidance: { reasoning: "", recommendations: [], strength: "light" },
  }),
);
await mkdir(join(runDir, "observations"), { recursive: true });
await writeFile(
  join(runDir, "observations", "001.json"),
  JSON.stringify({
    kind: "browser",
    summary: "Captured test fixture",
    artifacts: [screenshotPath],
    metadata: { captures: [{ title: "Fixture product" }] },
  }),
);
await mkdir(join(runDir, "judgments"), { recursive: true });
await writeFile(
  join(runDir, "judgments", "001.json"),
  JSON.stringify({
    verdict: "FINAL_CANDIDATE",
    assessment: "Product is ready",
    critical_gaps: [],
    next_direction: "Check final jury",
    confidence: 0.99,
  }),
);
await mkdir(join(runDir, "jury"), { recursive: true });
await writeFile(
  join(runDir, "jury", "001.json"),
  JSON.stringify([{ verdict: "PASS", reason: "Meets goal", critical_gaps: [] }]),
);

const configPath = join(dir, "setpoint.yaml");
await writeFile(
  configPath,
  [
    "version: 1",
    "task: Render an end-to-end dashboard fixture",
    "agent:",
    "  command: node",
    "models:",
    "  provider: agent",
    "observer:",
    "  type: command",
    "  command: echo success",
    `run_dir: ${stateRoot}`,
    "",
  ].join("\n"),
);

const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const address = probe.address();
const port = typeof address === "object" && address ? address.port : 0;
await new Promise((resolve) => probe.close(resolve));

const child = spawn(
  process.execPath,
  ["dist/cli.js", "ui", "--config", configPath, "--no-open", "--port", String(port)],
  { cwd, stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
child.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

let browser;
try {
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error("UI process exited: " + serverOutput);
    try {
      const response = await fetch(origin + "/api/state");
      if (response.ok && (await response.json()).run?.id === "visual-fixture") {
        ready = true;
        break;
      }
    } catch {
      // Server still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(ready, "Setpoint UI did not serve its persisted run: " + serverOutput);

  const allowed = await fetch(origin + "/artifact?path=" + encodeURIComponent(screenshotPath));
  assert.equal(allowed.status, 200, "real in-run screenshot should be served");
  const blocked = await fetch(origin + "/artifact?path=" + encodeURIComponent(linkedPath));
  assert.equal(blocked.status, 403, "symlinked files outside run must be rejected");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.waitForFunction(
    () => document.getElementById("run-id")?.textContent === "visual-fixture",
  );
  await page.getByText("A working developer dashboard").waitFor();
  await page.locator("#judgment").getByText("FINAL_CANDIDATE").waitFor();
  await page.screenshot({ path: join(evidenceDir, "ui-desktop.png"), fullPage: true });
  console.log(
    "SETPOINT_UI_DESKTOP_JPEG:" +
      (await page.screenshot({ type: "jpeg", quality: 55 })).toString("base64"),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(evidenceDir, "ui-mobile.png"), fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 4,
  );
  assert.equal(overflow, false, "Setpoint dashboard overflows 390px mobile viewport");
  console.log(
    "SETPOINT_UI_MOBILE_JPEG:" +
      (await page.screenshot({ type: "jpeg", quality: 55 })).toString("base64"),
  );

  assert.deepEqual(errors, [], "uncaught browser errors");
  console.log("PASS real UI, run reconstruction, screenshots, mobile layout and symlink isolation");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}
