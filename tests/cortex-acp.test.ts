import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AcpCodingAgent } from "../src/agent/acp.js";

const CORTEX_BIN = process.env.CORTEX_BIN ?? "/tmp/cortex-bin";
const describeCortex = existsSync(CORTEX_BIN) ? describe : describe.skip;

// These are true external integration tests: they require a built Cortex binary
// plus the user's normal Cortex/Axon model configuration and credentials.

describeCortex("Cortex ACP integration (real binary)", () => {
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
    expect(sid2).toBe(sid1);

    const r2 = await agent.prompt(
      "What word did I ask you to remember? Reply with just that word.",
    );
    expect(r2.stopReason).toBe("end_turn");
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

    const result = await agent.prompt("Write a haiku about the ocean. Do not use any tools.");
    expect(result.text.length).toBeGreaterThan(10);
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

    const promptP = agent.prompt(
      "Write a very long detailed essay about the history of computing, at least 2000 words. Do not use any tools.",
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await agent.close();

    const result = await promptP.catch((error) => ({ error: String(error) }));
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

    expect((agent as unknown as { child: { killed: boolean } }).child?.killed).toBe(true);
    await expect(agent.prompt("anything")).rejects.toThrow(/not started/);
  }, 30000);
});
