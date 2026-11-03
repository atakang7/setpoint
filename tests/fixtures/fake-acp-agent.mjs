import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";

const app = acp.agent({ name: "fake-acp-agent" });

let sessionCounter = 0;
const sessionPromptCounts = new Map();

app.onRequest(acp.methods.agent.initialize, () => {
  process.stderr.write("fake-acp: handler initialize\n");
  return Promise.resolve({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: {},
    promptCapabilities: { supportedContentTypes: [{ type: "text" }] },
  });
});

app.onRequest(acp.methods.agent.session.new, (ctx) => {
  process.stderr.write(`fake-acp: handler session.new params=${JSON.stringify(ctx.params)}\n`);
  sessionCounter += 1;
  const sessionId = `sess-${sessionCounter}`;
  sessionPromptCounts.set(sessionId, 0);
  return Promise.resolve({ sessionId });
});

app.onRequest(acp.methods.agent.session.prompt, async (ctx) => {
  const params = ctx.params;
  process.stderr.write(`fake-acp: handler session.prompt params=${JSON.stringify(params)}\n`);
  const sessionId = ctx.params.sessionId;
  const count = (sessionPromptCounts.get(sessionId) ?? 0) + 1;
  sessionPromptCounts.set(sessionId, count);

  const promptBlocks = params?.prompt ?? [];
  const promptText = promptBlocks.map((b) => (b.type === "text" ? b.text : "")).join("");

  await ctx.client.notify(acp.methods.client.session.update, {
    sessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: `[fake-acp session=${sessionId} prompt#${count}] received: ${promptText}`,
      },
    },
  });

  return { stopReason: "end_turn" };
});

app.onRequest(acp.methods.agent.session.close, () => Promise.resolve({}));

const stdoutWeb = Writable.toWeb(process.stdout);
const stdinWeb = Readable.toWeb(process.stdin);
const stream = acp.ndJsonStream(stdoutWeb, stdinWeb);

process.stderr.write("fake-acp-agent: connecting\n");
app
  .connectWith(stream, async () => {
    process.stderr.write("fake-acp-agent: connected, waiting\n");
    await new Promise(() => {});
  })
  .catch((e) => {
    process.stderr.write(`fake-acp-agent: connection error: ${e?.stack ?? e}\n`);
    process.exit(0);
  });
