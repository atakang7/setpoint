import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, extname, resolve, sep } from "node:path";
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
      send(res, 200, imageMimeType(path), await readFile(path));
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
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : null;
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
  const command: [string, string[]] =
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

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setpoint Run</title>
<style>
:root{color-scheme:dark;--bg:#0b0d10;--panel:#12161c;--panel2:#171c23;--line:#262d36;--text:#f2f5f8;--muted:#8993a1;--accent:#8ab4ff;--good:#7ee787;--warn:#f2cc60;--bad:#ff7b72}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.shell{max-width:1500px;margin:0 auto;padding:20px}.top{display:flex;justify-content:space-between;gap:16px;margin-bottom:16px}.brand{font-size:20px;font-weight:700}.muted{color:var(--muted)}.badge{display:inline-flex;gap:8px;align-items:center;padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:var(--panel)}.dot{width:8px;height:8px;border-radius:50%;background:var(--warn)}.dot.done{background:var(--good)}.dot.failed{background:var(--bad)}.grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:16px}.stack{display:grid;gap:16px}.card{min-width:0;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}.label{margin-bottom:8px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.09em}.kv{display:grid;grid-template-columns:95px minmax(0,1fr);gap:6px 10px}.kv div:nth-child(odd){color:var(--muted)}.phase{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px}.phase span{padding:8px 4px;text-align:center;border:1px solid var(--line);border-radius:8px;color:var(--muted);font-size:11px}.phase .active{border-color:var(--accent);color:var(--text);background:#182235}.phase .done{color:var(--good)}.shots,.compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.shot{width:100%;display:block;border:1px solid var(--line);border-radius:9px;background:#060708}.history{display:grid;gap:8px}.history button{width:100%;padding:10px;text-align:left;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:8px;cursor:pointer}.verdict{font-weight:700}.continue{color:var(--warn)}.pass{color:var(--good)}.fail{color:var(--bad)}.copy{white-space:pre-wrap;overflow-wrap:anywhere}.north{max-height:300px;overflow:auto}.controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.controls label{display:flex;align-items:center;gap:6px;color:var(--muted)}select{padding:6px;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:7px}.empty{padding:28px;text-align:center;color:var(--muted)}@media(max-width:900px){.grid{grid-template-columns:1fr}.shots,.compare{grid-template-columns:1fr}.phase{grid-template-columns:repeat(3,1fr)}.shell{padding:12px}}
</style>
</head>
<body>
<div class="shell">
  <div class="top">
    <div><div class="brand">SETPOINT</div><div id="run-id" class="muted">waiting for run…</div></div>
    <div><span class="badge"><span id="dot" class="dot"></span><span id="phase">WAITING</span></span> <span id="iteration" class="badge">iteration —</span></div>
  </div>
  <div id="empty" class="card empty">No Setpoint run found yet. This page updates automatically.</div>
  <div id="app" class="grid" hidden>
    <aside class="stack">
      <section class="card"><div class="label">Run</div><div id="run-kv" class="kv"></div><div id="phases" class="phase"></div></section>
      <section class="card"><div class="label">Roles</div><div id="roles" class="kv"></div></section>
      <section class="card north"><div class="label">Frozen North Star</div><div id="north" class="copy"></div></section>
      <section class="card"><div class="label">History</div><div id="history" class="history"></div></section>
    </aside>
    <main class="stack">
      <section class="card"><div class="label">Current product observation</div><div id="shots" class="shots"></div></section>
      <section class="card"><div class="label">Latest judgment</div><div id="judgment" class="copy"></div></section>
      <section class="card"><div class="label">Iteration comparison</div><div class="controls"><label>Before <select id="before"></select></label><label>After <select id="after"></select></label></div><div class="compare"><div><div id="before-meta" class="muted"></div><img id="before-img" class="shot" alt="Before iteration screenshot"></div><div><div id="after-meta" class="muted"></div><img id="after-img" class="shot" alt="After iteration screenshot"></div></div></section>
    </main>
  </div>
</div>
<script>
var state=null;var compareReady=false;
function el(id){return document.getElementById(id)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function kv(rows){return rows.map(function(r){return '<div>'+esc(r[0])+'</div><div>'+esc(r[1])+'</div>'}).join('')}
function vclass(v){return v==='PASS'?'pass':v==='FAIL'?'fail':'continue'}
function latest(key){if(!state)return null;for(var i=state.iterations.length-1;i>=0;i--){if(state.iterations[i][key])return state.iterations[i]}return null}
function render(data){state=data;if(!data.run){el('empty').hidden=false;el('app').hidden=true;return}el('empty').hidden=true;el('app').hidden=false;var r=data.run;el('run-id').textContent=r.id;el('phase').textContent=r.phase.toUpperCase();el('iteration').textContent='iteration '+r.iteration+' / '+data.maxIterations;el('dot').className='dot '+(r.phase==='done'?'done':r.phase==='failed'?'failed':'');el('run-kv').innerHTML=kv([['state',r.phase],['iteration',r.iteration+' / '+data.maxIterations],['started',r.started_at],['updated',r.updated_at],['final',r.final_reason||'—']]);
var order=['defining','coding','observing','judging','jury'];var current=order.indexOf(r.phase);el('phases').innerHTML=order.map(function(p,i){var cls=p===r.phase?'active':(r.phase==='done'||i<current)?'done':'';return '<span class="'+cls+'">'+p+'</span>'}).join('');
el('roles').innerHTML=kv([['coder',(data.roles.coder.command+' '+(data.roles.coder.args||[]).join(' ')).trim()],['session',data.roles.coder.sessionId||'pending'],['judge',data.roles.judge],['jury',(data.roles.jury||[]).join(', ')]]);
var n=data.northStar;el('north').innerHTML=n?'<strong>'+esc(n.vision)+'</strong><br><br>'+esc(n.quality_bar)+'<br><br><span class="muted">Avoid:</span> '+esc((n.avoid||[]).join(' · ')):'pending';
var cur=data.iterations[data.iterations.length-1];var shots=cur&&cur.screenshots?cur.screenshots:[];el('shots').innerHTML=shots.length?shots.map(function(s){return '<div><div class="muted">'+esc(s.name)+'</div><a href="'+s.url+'" target="_blank"><img class="shot" src="'+s.url+'" alt="'+esc(s.name)+'"></a></div>'}).join(''):'<div class="empty">No screenshot for the current iteration yet.</div>';
var judged=latest('judgment');if(judged){var j=judged.judgment;var gaps=(j.critical_gaps||[]).map(function(g){return '• '+esc(g)}).join('<br>');el('judgment').innerHTML='<span class="verdict '+vclass(j.verdict)+'">'+esc(j.verdict)+'</span> · confidence '+esc(j.confidence)+'<br><br>'+esc(j.assessment)+'<br><br><span class="muted">Next direction</span><br>'+esc(j.next_direction)+(gaps?'<br><br><span class="muted">Critical gaps</span><br>'+gaps:'')}else{el('judgment').textContent=r.phase==='judging'?'Judge is evaluating the current observation…':'No judgment yet.'}
var entries=data.iterations.filter(function(i){return i.judgment||i.jury});el('history').innerHTML=entries.length?entries.map(function(i){var j=i.judgment;var jury=i.jury;var juryText=jury?' · jury '+jury.filter(function(v){return v.verdict==='PASS'}).length+'/'+jury.length:'';return '<button type="button" data-iteration="'+i.iteration+'"><span class="muted">'+String(i.iteration).padStart(2,'0')+'</span> · <span class="verdict '+vclass(j&&j.verdict)+'">'+esc(j&&j.verdict||'—')+'</span>'+juryText+'<br><span class="muted">'+esc(j&&j.next_direction||'')+'</span></button>'}).join(''):'<div class="muted">No completed judgments yet.</div>';setupCompare()}
function setupCompare(){var viable=state.iterations.filter(function(i){return i.screenshots&&i.screenshots.length});if(!viable.length)return;var opts=viable.map(function(i){return '<option value="'+i.iteration+'">iteration '+i.iteration+'</option>'}).join('');var b=el('before').value;var a=el('after').value;el('before').innerHTML=opts;el('after').innerHTML=opts;if(!compareReady){el('before').value=String(viable[0].iteration);el('after').value=String(viable[viable.length-1].iteration);compareReady=true}else{if(viable.some(function(i){return String(i.iteration)===b}))el('before').value=b;if(viable.some(function(i){return String(i.iteration)===a}))el('after').value=a;else el('after').value=String(viable[viable.length-1].iteration)}renderCompare()}
function renderCompare(){if(!state)return;['before','after'].forEach(function(side){var val=el(side).value;var iteration=state.iterations.find(function(i){return String(i.iteration)===val});var shot=iteration&&iteration.screenshots&&iteration.screenshots[0];var img=el(side+'-img');if(shot){img.src=shot.url;img.hidden=false;el(side+'-meta').textContent='iteration '+iteration.iteration+' · '+shot.name}else{img.hidden=true;el(side+'-meta').textContent='no screenshot'}})}
el('before').addEventListener('change',renderCompare);el('after').addEventListener('change',renderCompare);el('history').addEventListener('click',function(e){var button=e.target.closest('button[data-iteration]');if(!button)return;el('after').value=button.dataset.iteration;renderCompare()});
async function poll(){try{var response=await fetch('/api/state',{cache:'no-store'});render(await response.json())}catch(error){el('phase').textContent='DISCONNECTED'}finally{setTimeout(poll,1500)}}poll();
</script>
</body>
</html>`;
