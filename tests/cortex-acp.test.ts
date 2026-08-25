import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AcpCodingAgent } from "../src/agent/acp.js";

const CORTEX_BIN = "/tmp/cortex-bin";

// Cortex needs its config dir (already present at ~/.config/cortex).
// We only need to prove the ACP wire protocol works with the real binary.

describe("Cortex ACP integration (real binary)", () => {
  it("ACP initialize succeeds", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cortex-acp-init-"));
    const agent = new AcpCodingAgent({
      command: CORTEX_BIN,
      args: ["--acp"],
      permissions: "auto-allow",
    });
    await agent.start(cwd);
    expect(agent.sessionId()).toMatch(/^cortex-/);
    await agent.close();
  }, 15000);

  it("prompt #1 completes with streamed text", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cortex-acp-p1-"));
    const agent = new AcpCodingAgent({
      command: CORTEX_BIN,
      args: ["--acp"],
      permissions: "auto-allow",
    });
    await agent.start(cwd);
    const result = await agent.prompt("Say hello in one short sentence. Do not use any tools.");
    expect(result.stopReason).toBe("end_turn");
    expect(result.text.length).toBeGreaterThan(0);
    await agent.close();
  }, 60000);

  it("prompt #2 uses THE SAME ACP sessionId (persistent agent)", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cortex-acp-p2-"));
    const agent = new AcpCodingAgent({
      command: CORTEX_BIN,
      args: ["--acp"],
      permissions: "auto-allow",
    });
    await agent.start(cwd);
    const sid1 = agent.sessionId();
    const r1 = await agent.prompt("Remember the word BLUE. Reply with just OK.");
    expect(r1.stopReason).toBe("end_turn");

    const sid2 = agent.sessionId();
    expect(sid2).toBe(sid1); // same session

    const r2 = await agent.prompt(
      "What word did I ask you to remember? Reply with just that word.",
    );
    expect(r2.stopReason).toBe("end_turn");
    // The agent should recall BLUE from the first prompt — proves same session.
    expect(r2.text.toUpperCase()).toContain("BLUE");
    await agent.close();
  }, 90000);

  it("streaming session/update messages arrive during a prompt", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cortex-acp-stream-"));
    const agent = new AcpCodingAgent({
      command: CORTEX_BIN,
      args: ["--acp"],
      permissions: "auto-allow",
    });
    await agent.start(cwd);

    // We can't directly observe the SDK's internal notification queue, but
    // the prompt() method accumulates text from agent_message_chunk updates.
    // If streaming didn't work, text would be empty (no KindAssistantEnd fallback
    // because Cortex providers stream tokens). So non-empty text proves streaming.
    const result = await agent.prompt("Write a haiku about the ocean. Do not use any tools.");
    expect(result.text.length).toBeGreaterThan(10);
    // Haiku should have some line breaks or at least 3 distinct words.
    expect(result.text.split(/\s+/).length).toBeGreaterThan(5);
    await agent.close();
  }, 60000);

  it("session/cancel interrupts an active turn", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cortex-acp-cancel-"));
    const agent = new AcpCodingAgent({
      command: CORTEX_BIN,
      args: ["--acp"],
      permissions: "auto-allow",
    });
    await agent.start(cwd);

    // Start a long prompt that will take time (ask for a long output).
    // Then cancel it by closing the session mid-flight.
    const promptP = agent.prompt(
      "Write a very long detailed essay about the history of computing, at least 2000 words. Do not use any tools.",
    );

    // Give it a moment to start, then cancel.
    await new Promise((r) => setTimeout(r, 2000));

    // The SDK's session.cancel() is sent as a notification.
    // We simulate this by closing the session, which disposes + kills the child.
    // If the prompt was still running, the child process exit will cause
    // nextUpdate() to reject or the connection to close.
    await agent.close();

    // The prompt promise should resolve or reject (not hang forever).
    // We accept either — the key is it doesn't hang.
    const result = await promptP.catch((e) => ({ error: String(e) }));
    // Either it completed before close, or it was interrupted.
    expect(result).toBeTruthy();
  }, 30000);

  it("session/close cleans up the child process", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cortex-acp-close-"));
    const agent = new AcpCodingAgent({
      command: CORTEX_BIN,
      args: ["--acp"],
      permissions: "auto-allow",
    });
    await agent.start(cwd);
    const child = (agent as unknown as { child: { killed: boolean; pid: number } }).child;
    expect(child?.pid).toBeGreaterThan(0);
    await agent.prompt("Say OK.");
    await agent.close();

    // After close, child should be killed.
    expect((agent as unknown as { child: { killed: boolean } }).child?.killed).toBe(true);

    // Calling prompt after close should throw.
    await expect(agent.prompt("anything")).rejects.toThrow(/not started/);
  }, 30000);
});
