import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import type { SetpointConfig } from "./config.js";
import { isImagePath, loadRunSnapshot, type RunSnapshot } from "./inspect.js";

export interface RunUiOptions {
  host: string;
  port: number;
  open: boolean;
}

export async function startRunUi(config: SetpointConfig, options: RunUiOptions): Promise<void> {
  const server = createServer(async (req, res) => {
    try {
      await route(req, res, config);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, resolvePromise);
  });

  const url = `http://${options.host}:${options.port}`;
  console.log(`Setpoint UI: ${url}`);
  console.log("Read-only live view. Press Ctrl-C to stop.");
  if (options.open) openBrowser(url);

  await new Promise<void>((resolvePromise) => {
    const stop = () => server.close(() => resolvePromise());
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  config: SetpointConfig,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/") {
    send(res, 200, "text/html; charset=utf-8", DASHBOARD_HTML);
    return;
  }

  if (url.pathname === "/api/state") {
    const snapshot = await loadRunSnapshot(config.run_dir);
    sendJson(res, 200, snapshot ? serializeSnapshot(snapshot, config) : { run: null });
    return;
  }

  if (url.pathname === "/artifact") {
    const requested = url.searchParams.get("path");
    const snapshot = await loadRunSnapshot(config.run_dir);
    if (!requested || !snapshot) {
      sendJson(res, 404, { error: "artifact not found" });
      return;
    }
    const path = safeArtifactPath(snapshot.runDir, requested);
    if (!path || !isImagePath(path)) {
      sendJson(res, 403, { error: "artifact outside current run" });
      return;
    }
    try {
      const data = await readFile(path);
      send(res, 200, imageMimeType(path), data);
    } catch {
      sendJson(res, 404, { error: "artifact not found" });
    }
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

function serializeSnapshot(snapshot: RunSnapshot, config: SetpointConfig): Record<string, unknown> {
  return {
    run: snapshot.record,
    northStar: snapshot.northStar,
    roles: {
      coder: {
        command: config.agent.command,
        args: config.agent.args,
        sessionId: snapshot.record.agent_session_id ?? null,
      },
      judge: config.models.judge,
      jury: config.models.jury,
    },
    maxIterations: config.autopilot.max_iterations,
    iterations: snapshot.iterations.map((entry) => ({
      ...entry,
      screenshots: (entry.observation?.artifacts ?? [])
        .filter(isImagePath)
        .map((path) => ({
          path,
          name: basename(path),
          url: `/artifact?path=${encodeURIComponent(path)}`,
        })),
    })),
  };
}

function safeArtifactPath(runDir: string, requested: string): string | null {
  const root = resolve(runDir);
  const candidate = resolve(requested);
  if (candidate === root || candidate.startsWith(`${root}${sep}`)) return candidate;
  return null;
}

function imageMimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, "application/json; charset=utf-8", `${JSON.stringify(value)}\n`);
}

function send(res: ServerResponse, status: number, contentType: string, body: string | Buffer): void {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // The URL is already printed; opening a browser is best-effort only.
  }
}

const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setpoint Run</title>
<style>
:root{color-scheme:dark;--bg:#0b0d10;--panel:#12161c;--panel2:#171c23;--line:#262d36;--text:#f2f5f8;--muted:#8993a1;--accent:#8ab4ff;--good:#7ee787;--warn:#f2cc60;--bad:#ff7b72}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}button,select{font:inherit}.shell{max-width:1500px;margin:0 auto;padding:20px}.top{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;margin-bottom:16px}.brand{font-size:20px;font-weight:700}.muted{color:var(--muted)}.badge{display:inline-flex;align-items:center;gap:8px;padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:var(--panel)}.dot{width:8px;height:8px;border-radius:50%;background:var(--warn)}.dot.done{background:var(--good)}.dot.failed{background:var(--bad)}.grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:16px}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0}.stack{display:grid;gap:16px}.label{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin-bottom:8px}.kv{display:grid;grid-template-columns:95px minmax(0,1fr);gap:6px 10px}.kv div:nth-child(odd){color:var(--muted)}.phase{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px}.phase span{padding:8px 4px;text-align:center;border:1px solid var(--line);border-radius:8px;color:var(--muted);font-size:11px}.phase span.active{border-color:var(--accent);color:var(--text);background:#182235}.phase span.done{color:var(--good)}.screenshot{width:100%;display:block;border-radius:9px;border:1px solid var(--line);background:#060708}.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.history{display:grid;gap:8px}.history button{width:100%;text-align:left;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px;cursor:pointer}.history button:hover{border-color:#3b4655}.verdict{font-weight:700}.continue{color:var(--warn)}.pass{color:var(--good)}.fail{color:var(--bad)}.compare-controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.compare-controls label{display:flex;align-items:center;gap:6px;color:var(--muted)}select{background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:7px;padding:6px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.copy{white-space:pre-wrap;overflow-wrap:anywhere}.empty{color:var(--muted);padding:28px;text-align:center}.north{max-height:280px;overflow:auto}.strong{font-weight:700}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}@media(max-width:900px){.grid{grid-template-columns:1fr}.compare{grid-template-columns:1fr}.phase{grid-template-columns:repeat(3,1fr)}.shell{padding:12px}}
</style>
</head>
<body>
<div class="shell">
  <div class="top">
    <div><div class="brand">SETPOINT</div><div id="run-id" class="muted">waiting for run…</div></div>
    <div class="toolbar"><span class="badge"><span id="live-dot" class="dot"></span><span id="phase">WAITING</span></span><span id="iteration" class="badge">iteration —</span></div>
  </div>
  <div id="empty" class="card empty">No Setpoint run found yet. This page will update automatically.</div>
  <div id="app" class="grid" hidden>
    <aside class="stack">
      <section class="card"><div class="label">Run</div><div id="run-kv" class="kv"></div><div id="phases" class="phase"></div></section>
      <section class="card"><div class="label">Roles</div><div id="roles" class="kv"></div></section>
      <section class="card north"><div class="label">Frozen North Star</div><div id="north-star" class="copy"></div></section>
      <section class="card"><div class="label">Iteration history</div><div id="history" class="history"></div></section>
    </aside>
    <main class="stack">
      <section class="card"><div class="label">Current product observation</div><div id="current-shots" class="shots"></div></section>
      <section class="card"><div class="label">Current judgment</div><div id="judgment" class="copy"></div></section>
      <section class="card"><div class="label">Iteration comparison</div><div class="compare-controls"><label>Before <select id="before"></select></label><label>After <select id="after"></select></label></div><div class="compare"><div><div id="before-meta" class="muted"></div><img id="before-img" class="screenshot" alt="Before iteration screenshot"></div><div><div id="after-meta" class="muted"></div><img id="after-img" class="screenshot" alt="After iteration screenshot"></div></div></section>
    </main>
  </div>
</div>
<script>
const $=id=>document.getElementById(id);let state=null;let compareInitialized=false;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
function kv(rows){return rows.map(([a,b])=>`<div>${esc(a)}</div><div>${esc(b)}</div>`).join("")}
function latestWith(key){if(!state)return null;return [...state.iterations].reverse().find(i=>i[key])||null}
function verdictClass(v){return v==="PASS"?"pass":v==="FAIL"?"fail":"continue"}
function render(data){state=data;if(!data.run){$("empty").hidden=false;$("app").hidden=true;return}$("empty").hidden=true;$("app").hidden=false;const r=data.run;$("run-id").textContent=r.id;$("phase").textContent=r.phase.toUpperCase();$("iteration").textContent=`iteration ${r.iteration} / ${data.maxIterations}`;$("live-dot").className=`dot ${r.phase==="done"?"done":r.phase==="failed"?"failed":""}`;
$("run-kv").innerHTML=kv([["state",r.phase],["iteration",`${r.iteration} / ${data.maxIterations}`],["started",r.started_at],["updated",r.updated_at],["final",r.final_reason||"—"]]);
const order=["defining","coding","observing","judging","jury"];const current=order.indexOf(r.phase);$("phases").innerHTML=order.map((p,i)=>`<span class="${p===r.phase?"active":(r.phase==="done"||i<current)?"done":""}">${p}</span>`).join("");
$("roles").innerHTML=kv([["coder",`${data.roles.coder.command} ${(data.roles.coder.args||[]).join(" ")}`.trim()],["session",data.roles.coder.sessionId||"pending"],["judge",data.roles.judge],["jury",(data.roles.jury||[]).join(", ")]]);
const n=data.northStar;$("north-star").innerHTML=n?`<div class="strong">${esc(n.vision)}</div><br>${esc(n.quality_bar)}<br><br><span class="muted">Avoid:</span> ${esc((n.avoid||[]).join(" · "))}`:"pending";
const currentIt=data.iterations[data.iterations.length-1];const shots=currentIt?.screenshots||[];$("current-shots").innerHTML=shots.length?shots.map(s=>`<div><div class="muted">${esc(s.name)}</div><a href="${s.url}" target="_blank"><img class="screenshot" src="${s.url}" alt="${esc(s.name)}"></a></div>`).join(""):"<div class='empty'>No screenshot for the current iteration yet.</div>";
const judged=latestWith("judgment");if(judged){const j=judged.judgment;$("judgment").innerHTML=`<span class="verdict ${verdictClass(j.verdict)}">${esc(j.verdict)}</span> · confidence ${esc(j.confidence)}<br><br>${esc(j.assessment)}<br><br><span class="muted">Next direction</span><br>${esc(j.next_direction)}${j.critical_gaps?.length?`<br><br><span class="muted">Critical gaps</span><br>${j.critical_gaps.map(g=>`• ${esc(g)}`).join("<br>")}`:""}`;}else{$("judgment").textContent=r.phase==="judging"?"Judge is evaluating the current observation…":"No judgment yet."}
$("history").innerHTML=data.iterations.some(i=>i.judgment||i.jury)?data.iterations.filter(i=>i.judgment||i.jury).map(i=>{const j=i.judgment;const jury=i.jury;return `<button type="button" data-iteration="${i.iteration}"><span class="muted">${String(i.iteration).padStart(2,"0")}</span> · <span class="verdict ${verdictClass(j?.verdict)}">${esc(j?.verdict||"—")}</span>${jury?` · jury ${jury.filter(v=>v.verdict==="PASS").length}/${jury.length}`:""}<br><span class="muted">${esc(j?.next_direction||"")}</span></button>`}).join(""):"<div class='muted'>No completed judgments yet.</div>";
setupCompare();}
function setupCompare(){const viable=state.iterations.filter(i=>i.screenshots?.length);if(!viable.length)return;const opts=viable.map(i=>`<option value="${i.iteration}">iteration ${i.iteration}</option>`).join("");if(!compareInitialized){$("before").innerHTML=opts;$("after").innerHTML=opts;$("before").value=String(viable[0].iteration);$("after").value=String(viable[viable.length-1].iteration);compareInitialized=true;}else{const b=$("before").value,a=$("after").value;$("before").innerHTML=opts;$("after").innerHTML=opts;if(viable.some(i=>String(i.iteration)===b))$("before").value=b;if(viable.some(i=>String(i.iteration)===a))$("after").value=a;else $("after").value=String(viable[viable.length-1].iteration);}renderCompare();}
function renderCompare(){if(!state)return;for(const side of ["before","after"]){const iteration=state.iterations.find(i=>String(i.iteration)===$(side).value);const shot=iteration?.screenshots?.[0];const img=$(side+"-img");if(shot){img.src=shot.url;img.hidden=false;$(side+"-meta").textContent=`iteration ${iteration.iteration} · ${shot.name}`;}else{img.hidden=true;$(side+"-meta").textContent="no screenshot";}}}
$("before").addEventListener("change",renderCompare);$("after").addEventListener("change",renderCompare);$("history").addEventListener("click",e=>{const b=e.target.closest("button[data-iteration]");if(!b)return;$("after").value=b.dataset.iteration;renderCompare();});
async function poll(){try{const r=await fetch("/api/state",{cache:"no-store"});render(await r.json());}catch(e){$("phase").textContent="DISCONNECTED";}finally{setTimeout(poll,1500)}}poll();
</script>
</body>
</html>`;
