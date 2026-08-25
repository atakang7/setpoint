import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RunRecord } from "./types.js";

export class RunStorage {
  readonly root: string;
  readonly runDir: string;
  readonly id: string;
  constructor(baseDir: string, cwd = process.cwd(), id = createRunId()) {
    this.root = resolve(cwd, baseDir); this.id = id; this.runDir = join(this.root, "runs", id);
  }
  async init(): Promise<void> { await mkdir(this.runDir, { recursive: true }); }
  async writeJson(relativePath: string, value: unknown): Promise<string> {
    const path = join(this.runDir, relativePath); await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); return path;
  }
  async writeText(relativePath: string, value: string): Promise<string> {
    const path = join(this.runDir, relativePath); await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, value, "utf8"); return path;
  }
  async writeRun(record: RunRecord): Promise<string> {
    const runPath = await this.writeJson("run.json", record); await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, "latest"), `${this.id}\n`, "utf8"); return runPath;
  }
  static async readLatest(baseDir: string, cwd = process.cwd()): Promise<RunRecord | null> {
    const root = resolve(cwd, baseDir);
    try {
      const id = (await readFile(join(root, "latest"), "utf8")).trim();
      return JSON.parse(await readFile(join(root, "runs", id, "run.json"), "utf8")) as RunRecord;
    } catch {
      try {
        const ids = (await readdir(join(root, "runs"))).sort().reverse(); if (!ids[0]) return null;
        return JSON.parse(await readFile(join(root, "runs", ids[0], "run.json"), "utf8")) as RunRecord;
      } catch { return null; }
    }
  }
}

function createRunId(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${iso}-${rand}`;
}
