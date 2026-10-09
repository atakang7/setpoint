import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentStructuredModel } from "../src/llm/agent.js";

describe("ACP structured-model retry", () => {
  it("starts a new process after an invalid JSON response", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-acp-retry-"));
    const logFile = join(cwd, "sessions.jsonl");
    const markerFile = join(cwd, "malformed-sent");
    const model = new AgentStructuredModel({
      cwd,
      base: {
        command: "node",
        args: [join(import.meta.dirname, "fixtures", "fake-acp-model.mjs")],
        permissions: "deny",
        env: {
          SESSION_LOG: logFile,
          MALFORMED_ONCE_FILE: markerFile,
          FORCE_FINAL_CANDIDATE: "1",
        },
      },
    });

    const result = await model.completeJson<{ verdict: string }>({
      model: "default",
      prompt: "ROLE: PROGRESS JUDGE\nEvaluate the observed output.",
      schemaName: "test_retry_judgment",
      schema: { type: "object", properties: { verdict: { type: "string" } } },
    });
    expect(result.verdict).toBe("FINAL_CANDIDATE");

    const events = (await readFile(logFile, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { pid: number; event: string });
    const launched = events.filter((event) => event.event === "new").map((event) => event.pid);
    expect(launched).toHaveLength(2);
    expect(new Set(launched).size).toBe(2);
  }, 20000);
});
