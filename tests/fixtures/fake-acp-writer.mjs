import * as acp from "@agentclientprotocol/sdk";
import { Writable, Readable } from "node:stream";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const app = acp.agent({ name: "fake-acp-writer" });

let sessionCounter = 0;
const sessionPromptCounts = new Map();
const sessionCwds = new Map();

app.onRequest(acp.methods.agent.initialize, () =>
  Promise.resolve({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: {},
    promptCapabilities: { supportedContentTypes: [{ type: "text" }] },
  }),
);

app.onRequest(acp.methods.agent.session.new, (ctx) => {
  try {
    sessionCounter += 1;
    const sid = `sess-${sessionCounter}`;
    sessionPromptCounts.set(sid, 0);
    const cwd = ctx.params?.cwd ?? ".";
    sessionCwds.set(sid, cwd);
    writeFileSync(join(cwd, "output.txt"), "STATUS: unfinished\n");
    return Promise.resolve({ sessionId: sid });
  } catch (e) {
    process.stderr.write(`fake-acp-writer session.new error: ${e?.stack ?? e}\n`);
    throw e;
  }
});

app.onRequest(acp.methods.agent.session.prompt, async (ctx) => {
  try {
    const params = ctx.params;
    const sid = params.sessionId;
    const n = (sessionPromptCounts.get(sid) ?? 0) + 1;
    sessionPromptCounts.set(sid, n);

    const text = params.prompt.map((b) => (b.type === "text" ? b.text : "")).join("");

    await ctx.client.notify(acp.methods.client.session.update, {
      sessionId: sid,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `[writer prompt#${n}] ${text.slice(0, 60)}` },
      },
    });

    const status = n >= 3 ? "finished" : "unfinished";
    const cwd = sessionCwds.get(sid) ?? ".";
    writeFileSync(join(cwd, "output.txt"), `STATUS: ${status}\n`);

    return { stopReason: "end_turn" };
  } catch (e) {
    process.stderr.write(`fake-acp-writer session.prompt error: ${e?.stack ?? e}\n`);
    throw e;
  }
});

app.onRequest(acp.methods.agent.session.close, () => Promise.resolve({}));

const stream = acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin));
app
  .connectWith(stream, async () => {
    process.stderr.write("fake-acp-writer connected\n");
    await new Promise(() => {});
  })
  .catch((err) => {
    process.stderr.write(`fake-acp-writer connect error: ${err}\n`);
    process.exit(0);
  });
