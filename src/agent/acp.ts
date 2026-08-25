import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { CodingAgent, PromptTurnResult } from "../types.js";

export interface AcpCodingAgentOptions {
  command: string;
  args: string[];
  env?: Record<string, string>;
  permissions: "auto-allow" | "deny";
}
export class AcpCodingAgent implements CodingAgent {
  private child?: ChildProcess;
  private exitInfo: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  private session?: acp.ActiveSession;
  private stream?: acp.Stream;
  private connectionTask?: Promise<unknown>;
  private holdResolve?: () => void;
  private started = false;
  constructor(private readonly options: AcpCodingAgentOptions) {}
  async start(cwd: string): Promise<void> {
    if (this.started) return;
    this.started = true;
    const child = spawn(this.options.command, this.options.args, {
      cwd,
      env: { ...process.env, ...this.options.env },
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.child = child;
    const input = Writable.toWeb(child.stdin);
    const output = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(input, output);
    this.stream = stream;
    let readyResolve!: () => void;
    let readyReject!: (error: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const hold = new Promise<void>((resolve) => {
      this.holdResolve = resolve;
    });
    child.once("error", readyReject);
    child.once("exit", (code, signal) => {
      this.exitInfo = { code, signal };
      if (!this.session)
        readyReject(
          new Error(`ACP agent exited before session start (code=${code}, signal=${signal})`),
        );
    });
    this.connectionTask = acp
      .client({ name: "setpoint" })
      .onRequest(acp.methods.client.session.requestPermission, (ctx) => {
        const options = ctx.params.options;
        const wantAllow = this.options.permissions === "auto-allow";
        const selected =
          options.find((option) => {
            const kind = String(option.kind).toLowerCase();
            return wantAllow ? kind.includes("allow") : kind.includes("reject");
          }) ?? options[0];
        if (!selected)
          throw new Error("ACP agent requested permission without offering any options");
        return Promise.resolve({
          outcome: { outcome: "selected" as const, optionId: selected.optionId },
        });
      })
      .connectWith(stream, async (ctx) => {
        await ctx.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
        });
        this.session = await ctx.buildSession(cwd).start();
        readyResolve();
        await hold;
      })
      .catch((error) => {
        if (!this.session) {
          readyReject(
            new Error(
              `ACP agent exited before session start (${error instanceof Error ? error.message : error})`,
            ),
          );
        } else {
          readyReject(error);
        }
      });
    await ready;
  }
  sessionId(): string | undefined {
    return this.session?.sessionId;
  }
  async prompt(text: string, timeoutMs = 120_000): Promise<PromptTurnResult> {
    return this.promptBlocks([{ type: "text", text }], timeoutMs);
  }

  async promptWithImages(
    text: string,
    imagePaths: string[],
    timeoutMs = 120_000,
  ): Promise<PromptTurnResult> {
    const blocks: acp.ContentBlock[] = [{ type: "text", text }];
    for (const path of imagePaths) {
      const bytes = await readFile(path);
      blocks.push({
        type: "image",
        data: bytes.toString("base64"),
        mimeType: mimeFor(path),
      });
    }
    return this.promptBlocks(blocks, timeoutMs);
  }

  private async promptBlocks(
    blocks: acp.ContentBlock[],
    timeoutMs: number,
  ): Promise<PromptTurnResult> {
    if (!this.session) throw new Error("ACP session is not started");
    void this.session.prompt(blocks).catch(() => undefined);
    let output = "";
    for (;;) {
      const message = await this.raceWithTimeout(this.session.nextUpdate(), timeoutMs);
      if (message.kind === "stop") return { stopReason: String(message.stopReason), text: output };
      const update = message.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text")
        output += update.content.text;
    }
  }

  private async raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`ACP prompt timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async close(): Promise<void> {
    this.session?.dispose();
    this.session = undefined;
    this.holdResolve?.();
    this.holdResolve = undefined;
    try {
      await this.stream?.writable.close();
    } catch {
      /* stream may already be closed */
    }
    if (this.child && !this.child.killed) this.child.kill();
    try {
      await this.connectionTask;
    } catch {
      /* connection errors during shutdown are expected */
    }
  }
}

function mimeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Unsupported ACP image type: ${path}`);
  }
}
