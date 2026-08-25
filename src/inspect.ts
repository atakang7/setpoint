import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SetpointConfig } from "./config.js";
import { RunStorage } from "./storage.js";
import type {
  Judgment,
  JuryVerdict,
  NorthStar,
  Observation,
  PromptTurnResult,
  RunRecord,
} from "./types.js";

export interface IterationSnapshot {
  iteration: number;
  turn: PromptTurnResult | null;
  observation: Observation | null;
  judgment: Judgment | null;
  jury: JuryVerdict[] | null;
}

export interface RunSnapshot {
  record: RunRecord;
  runDir: string;
  northStar: NorthStar | null;
  iterations: IterationSnapshot[];
}

export async function loadRunSnapshot(
  baseDir: string,
  cwd = process.cwd(),
): Promise<RunSnapshot | null> {
  const record = await RunStorage.readLatest(baseDir, cwd);
  if (!record) return null;

  const root = resolve(cwd, baseDir);
  const runDir = join(root, "runs", record.id);
  const northStar = await readJson<NorthStar>(
    record.north_star_path ?? join(runDir, "north-star.json"),
  );
  const iterations: IterationSnapshot[] = [];

  for (let iteration = 1; iteration <= record.iteration; iteration++) {
    const name = `${String(iteration).padStart(3, "0")}.json`;
    iterations.push({
      iteration,
      turn: await readJson<PromptTurnResult>(join(runDir, "turns", name)),
      observation: await readJson<Observation>(join(runDir, "observations", name)),
      judgment: await readJson<Judgment>(join(runDir, "judgments", name)),
      jury: await readJson<JuryVerdict[]>(join(runDir, "jury", name)),
    });
  }

  return { record, runDir, northStar, iterations };
}

export function formatRunSnapshot(snapshot: RunSnapshot, config: SetpointConfig): string {
  const { record, northStar, iterations } = snapshot;
  const latest = iterations.at(-1);
  const latestJudged = [...iterations].reverse().find((entry) => entry.judgment)?.judgment;
  const latestJury = [...iterations].reverse().find((entry) => entry.jury)?.jury;
  const screenshotCount = iterations.reduce(
    (count, entry) => count + (entry.observation?.artifacts.filter(isImagePath).length ?? 0),
    0,
  );
  const elapsed = formatDuration(Date.now() - new Date(record.started_at).getTime());
  const lines: string[] = [];

  lines.push(`SETPOINT  ${record.id}`);
  lines.push("");
  lines.push(row("STATE", record.phase.toUpperCase()));
  lines.push(row("ITERATION", `${record.iteration} / ${config.autopilot.max_iterations}`));
  lines.push(row("ELAPSED", elapsed));
  lines.push(row("UPDATED", record.updated_at));
  lines.push("");
  lines.push(`NORTH STAR   ${northStar ? "frozen ✓" : "pending"}`);
  if (northStar) lines.push(`  ${truncate(northStar.vision, 110)}`);
  lines.push("");
  lines.push("CODER");
  lines.push(
    `  agent      ${config.agent.command}${config.agent.args.length ? ` ${config.agent.args.join(" ")}` : ""}`,
  );
  lines.push(`  session    ${record.agent_session_id ?? "pending"}`);
  lines.push(`  prompts    ${iterations.filter((entry) => entry.turn).length}`);
  lines.push(
    `  status     ${record.phase === "coding" ? "working" : record.agent_session_id ? "idle" : "pending"}`,
  );
  lines.push("");
  lines.push("OBSERVER");
  lines.push(`  type       ${config.observer.type}`);
  lines.push(`  captures   ${iterations.filter((entry) => entry.observation).length}`);
  lines.push(`  images     ${screenshotCount}`);
  if (latest?.observation) lines.push(`  latest     ${truncate(latest.observation.summary, 100)}`);
  lines.push("");
  lines.push("JUDGE");
  lines.push(
    `  agent      ${config.models.provider === "agent" ? config.models.judge : config.models.judge}`,
  );
  lines.push(
    `  status     ${record.phase === "judging" ? "evaluating" : (latestJudged?.verdict ?? "pending")}`,
  );
  if (latestJudged) {
    lines.push(`  direction  ${truncate(latestJudged.next_direction, 100)}`);
    if (latestJudged.critical_gaps[0])
      lines.push(`  gap        ${truncate(latestJudged.critical_gaps[0], 100)}`);
  }
  lines.push("");
  lines.push("JURY");
  lines.push(
    `  status     ${record.phase === "jury" ? "evaluating" : latestJury ? jurySummary(latestJury) : "not reached"}`,
  );
  if (latestJury)
    lines.push(`  verdicts   ${latestJury.map((verdict) => verdict.verdict).join(" / ")}`);
  lines.push("");
  lines.push("HISTORY");
  if (!iterations.some((entry) => entry.judgment || entry.jury)) {
    lines.push("  No completed judgments yet.");
  } else {
    for (const entry of iterations) {
      if (!entry.judgment && !entry.jury) continue;
      const judgment = entry.judgment?.verdict ?? "—";
      const jury = entry.jury ? ` | jury ${jurySummary(entry.jury)}` : "";
      const direction = entry.judgment?.next_direction
        ? ` — ${truncate(entry.judgment.next_direction, 78)}`
        : "";
      lines.push(`  ${String(entry.iteration).padStart(2, "0")}  ${judgment}${jury}${direction}`);
    }
  }

  if (record.final_reason) {
    lines.push("");
    lines.push("FINAL");
    lines.push(`  ${record.phase.toUpperCase()} — ${truncate(record.final_reason, 120)}`);
  }

  return lines.join("\n");
}

export async function watchRun(config: SetpointConfig, intervalMs = 1000): Promise<void> {
  for (;;) {
    const snapshot = await loadRunSnapshot(config.run_dir);
    process.stdout.write("\x1b[2J\x1b[H");
    if (!snapshot) {
      process.stdout.write("No Setpoint runs found. Waiting…\n");
    } else {
      process.stdout.write(`${formatRunSnapshot(snapshot, config)}\n`);
      if (snapshot.record.phase === "done" || snapshot.record.phase === "failed") return;
    }
    await sleep(intervalMs);
  }
}

export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(path);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function row(label: string, value: string): string {
  return `${label.padEnd(12)} ${value}`;
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function jurySummary(verdicts: JuryVerdict[]): string {
  const pass = verdicts.filter((verdict) => verdict.verdict === "PASS").length;
  return `${pass}/${verdicts.length} PASS`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
