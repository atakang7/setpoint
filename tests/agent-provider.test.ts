import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { initConfig, loadConfig, type SetpointConfig } from "../src/config.js";
import { createRuntime } from "../src/factory.js";
import { SetpointEngine } from "../src/engine.js";
import { RunStorage } from "../src/storage.js";
import { AgentStructuredModel } from "../src/llm/agent.js";
import { AcpCodingAgent } from "../src/agent/acp.js";
import { CommandObserver } from "../src/observer/command.js";

const FIXTURE_DIR = join(import.meta.dirname, "fixtures");
const MODEL_AGENT = join(FIXTURE_DIR, "fake-acp-model.mjs");

interface LogEntry {
  pid: number;
  event: string;
  sessionId: string | null;
  role: string | null;
}

async function readLog(path: string): Promise<LogEntry[]> {
  try {
    const text = await readFile(path, "utf8");
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LogEntry);
  } catch {
    return [];
  }
}

/** Group log entries by PID. Each PID = one process = one AcpCodingAgent = one session. */
function groupByPid(log: LogEntry[]): Map<number, LogEntry[]> {
  const map = new Map<number, LogEntry[]>();
  for (const e of log) {
    if (!map.has(e.pid)) map.set(e.pid, []);
    map.get(e.pid)!.push(e);
  }
  return map;
}

/** Find the role of a process (from its prompt event). */
function roleOf(entries: LogEntry[]): string | null {
  const prompt = entries.find((e) => e.event === "prompt");
  return prompt?.role ?? null;
}

function baseAgentOptions(logFile: string, extra: Record<string, string> = {}) {
  return {
    command: "node",
    args: [MODEL_AGENT],
    env: { SESSION_LOG: logFile, ...extra } as Record<string, string>,
    permissions: "auto-allow" as const,
  };
}

function makeConfig(opts: { maxIterations: number; jury?: string[] }): SetpointConfig {
  return {
    task: "make output.txt say STATUS: finished",
    agent: { protocol: "acp", command: "node", args: [], permissions: "auto-allow" },
    models: {
      provider: "agent",
      ideal_definer: "default",
      judge: "default",
      jury: opts.jury ?? ["default", "default", "default"],
    },
    observer: { type: "command", command: "cat output.txt", timeout_ms: 5000 },
    autopilot: { max_iterations: opts.maxIterations, require_unanimous_jury: true },
    prompts: { ideal_definer: "", coder: "", judge: "", jury: "" },
  } as unknown as SetpointConfig;
}

async function runEngine(opts: {
  cwd: string;
  logFile: string;
  maxIterations: number;
  envExtra?: Record<string, string>;
  jury?: string[];
  profiles?: Record<string, unknown>;
}) {
  const base = baseAgentOptions(opts.logFile, opts.envExtra ?? {});
  const model = new AgentStructuredModel({
    cwd: opts.cwd,
    base,
    profiles: opts.profiles as Record<string, Partial<typeof base>> | undefined,
  });
  const agent = new AcpCodingAgent(base);
  const observer = new CommandObserver({
    command: "cat output.txt",
    timeoutMs: 5000,
    cwd: opts.cwd,
  });
  const config = makeConfig({ maxIterations: opts.maxIterations, jury: opts.jury });
  const storage = new RunStorage(".setpoint", opts.cwd);
  const engine = new SetpointEngine(config, {
    model,
    agent,
    observer,
    storage,
    cwd: opts.cwd,
    onEvent: () => {},
  });
  const result = await engine.run();
  const log = await readLog(opts.logFile);
  return { result, log, storage };
}

describe("no-API-key architecture (real ACP sessions for all reasoning)", () => {
  it("1. setpoint init generates config with provider: agent and no OPENAI_API_KEY requirement", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-init-"));
    const configPath = join(cwd, "setpoint.yaml");
    const result = await initConfig(configPath);
    expect(result).toBe("created");
    const text = await readFile(configPath, "utf8");
    expect(text).toContain("provider: agent");
    expect(text).not.toContain("OPENAI_API_KEY");
    expect(text).not.toContain("api_key_env");
  });

  it("2. setpoint doctor succeeds without an OpenAI key when using the agent provider", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-doctor-"));
    const configPath = join(cwd, "setpoint.yaml");
    await initConfig(configPath);
    const config = await loadConfig(configPath);
    expect(config.models.provider).toBe("agent");
    const before = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createRuntime(config, cwd)).not.toThrow();
    } finally {
      if (before !== undefined) process.env.OPENAI_API_KEY = before;
    }
  });

  it("3. definer uses a fresh ACP session (unique process, distinct from coder)", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-definer-"));
    const logFile = join(cwd, "sessions.log");
    await runEngine({ cwd, logFile, maxIterations: 1 }).catch(() => undefined);
    const log = await readLog(logFile);
    const groups = groupByPid(log);
    const definerPids = [...groups.entries()]
      .filter(([, entries]) => roleOf(entries) === "definer")
      .map(([pid]) => pid);
    expect(definerPids.length).toBe(1);
    const definerEntries = groups.get(definerPids[0]!)!;
    // Fresh session: exactly one new, one prompt.
    expect(definerEntries.filter((e) => e.event === "new").length).toBe(1);
    expect(definerEntries.filter((e) => e.event === "prompt").length).toBe(1);
  });

  it("4. coder uses one persistent ACP session across multiple CONTINUE iterations", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-coder-"));
    const logFile = join(cwd, "sessions.log");
    await runEngine({ cwd, logFile, maxIterations: 3 }).catch(() => undefined);
    const log = await readLog(logFile);
    const groups = groupByPid(log);
    // Coder is the process with role "unknown" (no role marker in coder prompt).
    const coderPids = [...groups.entries()]
      .filter(([, entries]) => roleOf(entries) === "unknown")
      .map(([pid]) => pid);
    expect(coderPids.length).toBe(1);
    const coderEntries = groups.get(coderPids[0]!)!;
    // One session (one "new"), multiple prompts.
    expect(coderEntries.filter((e) => e.event === "new").length).toBe(1);
    expect(coderEntries.filter((e) => e.event === "prompt").length).toBeGreaterThanOrEqual(2);
    // No close (persistent session stays open until engine finishes).
  });

  it("5. every progress judgment gets a new ACP session (3 distinct processes, each one-shot)", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-judge-"));
    const logFile = join(cwd, "sessions.log");
    await runEngine({ cwd, logFile, maxIterations: 3 }).catch(() => undefined);
    const log = await readLog(logFile);
    const groups = groupByPid(log);
    const judgePids = [...groups.entries()]
      .filter(([, entries]) => roleOf(entries) === "judge")
      .map(([pid]) => pid);
    expect(judgePids.length).toBe(3);
    expect(new Set(judgePids).size).toBe(3);
    for (const pid of judgePids) {
      const entries = groups.get(pid)!;
      // Each judge process: one new, one prompt (one-shot fresh session).
      expect(entries.filter((e) => e.event === "new").length).toBe(1);
      expect(entries.filter((e) => e.event === "prompt").length).toBe(1);
    }
  });

  it("6. every final juror gets its own new ACP session (3 distinct processes, each one-shot)", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-jury-"));
    const logFile = join(cwd, "sessions.log");
    await writeFile(join(cwd, "output.txt"), "STATUS: finished\n");
    await runEngine({
      cwd,
      logFile,
      maxIterations: 3,
      envExtra: { FORCE_FINAL_CANDIDATE: "1", JURY_FAIL_FIRST: "0" },
    });
    const log = await readLog(logFile);
    const groups = groupByPid(log);
    const juryPids = [...groups.entries()]
      .filter(([, entries]) => roleOf(entries) === "jury")
      .map(([pid]) => pid);
    expect(juryPids.length).toBe(3);
    expect(new Set(juryPids).size).toBe(3);
    for (const pid of juryPids) {
      const entries = groups.get(pid)!;
      expect(entries.filter((e) => e.event === "new").length).toBe(1);
      expect(entries.filter((e) => e.event === "prompt").length).toBe(1);
    }
  });

  it("7. jury failure returns criticism to the SAME persistent coder session", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-juryfail-"));
    const logFile = join(cwd, "sessions.log");
    await writeFile(join(cwd, "output.txt"), "STATUS: finished\n");
    await runEngine({
      cwd,
      logFile,
      maxIterations: 5,
      envExtra: { FORCE_FINAL_CANDIDATE: "1", JURY_FAIL_FIRST: "1" },
    });
    const log = await readLog(logFile);
    const groups = groupByPid(log);
    // Coder: one process, one session, multiple prompts (initial + after jury fail).
    const coderPids = [...groups.entries()]
      .filter(([, entries]) => roleOf(entries) === "unknown")
      .map(([pid]) => pid);
    expect(coderPids.length).toBe(1);
    const coderEntries = groups.get(coderPids[0]!)!;
    expect(coderEntries.filter((e) => e.event === "new").length).toBe(1);
    expect(coderEntries.filter((e) => e.event === "prompt").length).toBeGreaterThanOrEqual(2);
    // At least one jury round with FAIL.
    const juryPids = [...groups.entries()]
      .filter(([, entries]) => roleOf(entries) === "jury")
      .map(([pid]) => pid);
    expect(juryPids.length).toBeGreaterThanOrEqual(3);
  });

  it("8. definer/judge/jury structured JSON output is parsed and validated by zod schemas", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-json-"));
    const logFile = join(cwd, "sessions.log");
    await writeFile(join(cwd, "output.txt"), "STATUS: finished\n");
    const { result, storage } = await runEngine({
      cwd,
      logFile,
      maxIterations: 3,
      envExtra: { FORCE_FINAL_CANDIDATE: "1", JURY_FAIL_FIRST: "0" },
    });
    expect(result.passed).toBe(true);
    expect(result.record.phase).toBe("done");
    expect(result.northStar.vision).toContain("STATUS: finished");
    const northStar = JSON.parse(await readFile(join(storage.runDir, "north-star.json"), "utf8"));
    expect(northStar.vision).toBeTruthy();
    for (const f of readdirSync(join(storage.runDir, "judgments"))) {
      const j = JSON.parse(await readFile(join(storage.runDir, "judgments", f), "utf8"));
      expect(["CONTINUE", "FINAL_CANDIDATE"]).toContain(j.verdict);
    }
    for (const f of readdirSync(join(storage.runDir, "jury"))) {
      const v = JSON.parse(await readFile(join(storage.runDir, "jury", f), "utf8"));
      for (const verdict of v) expect(["PASS", "FAIL"]).toContain(verdict.verdict);
    }
  });

  it("9. reasoning agent profiles inherit the main ACP command/args and can override them", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-profile-"));
    const logFile = join(cwd, "sessions.log");
    await writeFile(join(cwd, "output.txt"), "STATUS: finished\n");
    const profiles = {
      strong: {
        args: [MODEL_AGENT, "--strong"],
        permissions: "auto-allow" as const,
      },
    };
    await runEngine({
      cwd,
      logFile,
      maxIterations: 3,
      envExtra: { FORCE_FINAL_CANDIDATE: "1", JURY_FAIL_FIRST: "0" },
      jury: ["strong", "strong", "strong"],
      profiles,
    });
    const log = await readLog(logFile);
    const groups = groupByPid(log);
    const juryPids = [...groups.entries()]
      .filter(([, entries]) => roleOf(entries) === "jury")
      .map(([pid]) => pid);
    expect(juryPids.length).toBe(3);
    expect(new Set(juryPids).size).toBe(3);
  });

  it("10. optional provider: openai path still works structurally and requires an API key", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "sp-openai-"));
    const configYaml = [
      "version: 1",
      'task: "test"',
      "agent:",
      "  protocol: acp",
      "  command: node",
      "  args: []",
      "  permissions: auto-allow",
      "models:",
      "  provider: openai",
      "  api_key_env: MY_TEST_KEY",
      "observer:",
      "  type: command",
      "  command: 'echo hi'",
      "autopilot:",
      "  max_iterations: 1",
      "  require_unanimous_jury: true",
      "",
    ].join("\n");
    const configPath = join(cwd, "setpoint.yaml");
    await writeFile(configPath, configYaml);
    const config = await loadConfig(configPath);
    expect(config.models.provider).toBe("openai");

    const before = process.env.MY_TEST_KEY;
    delete process.env.MY_TEST_KEY;
    try {
      expect(() => createRuntime(config, cwd)).toThrow(/MY_TEST_KEY/);
    } finally {
      if (before !== undefined) process.env.MY_TEST_KEY = before;
    }

    process.env.MY_TEST_KEY = "test-key-12345";
    try {
      expect(() => createRuntime(config, cwd)).not.toThrow();
    } finally {
      if (before !== undefined) process.env.MY_TEST_KEY = before;
      else delete process.env.MY_TEST_KEY;
    }
  });
});
