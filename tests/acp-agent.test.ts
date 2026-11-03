import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AcpCodingAgent } from "../src/agent/acp.js";

const FIXTURE_DIR = join(import.meta.dirname, "fixtures");
const AGENT_SCRIPT = join(FIXTURE_DIR, "fake-acp-agent.mjs");

describe("ACP coding agent (real protocol traffic)", () => {
  it("spawns the process, initializes, creates a session, and delivers a prompt", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-acp-1-"));
    const agent = new AcpCodingAgent({
      command: "node",
      args: [AGENT_SCRIPT],
      permissions: "auto-allow",
    });
    await agent.start(cwd);
    expect(agent.sessionId()).toMatch(/^sess-/);
    const result = await agent.prompt("hello world");
    expect(result.stopReason).toBe("end_turn");
    expect(result.text).toContain("hello world");
    expect(result.text).toContain("prompt#1");
    await agent.close();
  }, 15000);

  it("delivers a second prompt into the SAME session (persistence)", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-acp-2-"));
    const agent = new AcpCodingAgent({
      command: "node",
      args: [AGENT_SCRIPT],
      permissions: "auto-allow",
    });
    await agent.start(cwd);
    const sid = agent.sessionId();
    const r1 = await agent.prompt("first");
    expect(r1.text).toContain("prompt#1");
    expect(r1.text).toContain(`session=${sid}`);
    const r2 = await agent.prompt("second");
    // Same session id → proves same persistent session.
    expect(agent.sessionId()).toBe(sid);
    expect(r2.text).toContain("prompt#2");
    expect(r2.text).toContain(`session=${sid}`);
    await agent.close();
  }, 15000);

  it("handles permission requests via auto-allow", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-acp-3-"));
    // The fake agent doesn't request permissions, but auto-allow path must not throw.
    const agent = new AcpCodingAgent({
      command: "node",
      args: [AGENT_SCRIPT],
      permissions: "auto-allow",
    });
    await agent.start(cwd);
    const r = await agent.prompt("perm test");
    expect(r.stopReason).toBe("end_turn");
    await agent.close();
  }, 15000);

  it("errors when the ACP process command does not exist", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-acp-4-"));
    const agent = new AcpCodingAgent({
      command: "this-command-does-not-exist-xyz",
      args: [],
      permissions: "auto-allow",
    });
    await expect(agent.start(cwd)).rejects.toThrow();
  }, 15000);

  it("errors when the ACP process crashes before session start", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-acp-5-"));
    // A process that exits immediately.
    const agent = new AcpCodingAgent({
      command: "node",
      args: ["-e", "process.exit(1)"],
      permissions: "auto-allow",
    });
    await expect(agent.start(cwd)).rejects.toThrow(/exited before session start/);
  }, 15000);

  it("cleans up the child process on close", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "setpoint-acp-6-"));
    const agent = new AcpCodingAgent({
      command: "node",
      args: [AGENT_SCRIPT],
      permissions: "auto-allow",
    });
    await agent.start(cwd);
    await agent.prompt("cleanup test");
    await agent.close();
    // After close, a new prompt must throw (session disposed).
    await expect(agent.prompt("post-close")).rejects.toThrow(/not started/);
  }, 15000);
});
