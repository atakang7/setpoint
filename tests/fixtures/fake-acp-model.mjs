import * as acp from "@agentclientprotocol/sdk";
import { Writable, Readable } from "node:stream";
import { appendFileSync } from "node:fs";

const app = acp.agent({ name: "fake-acp-model" });

const LOG_FILE = process.env.SESSION_LOG;
const FORCE_FINAL = process.env.FORCE_FINAL_CANDIDATE === "1";
const JURY_FAIL_FIRST = process.env.JURY_FAIL_FIRST === "1";

let sessionCounter = 0;
let currentSessionId = null;
let currentRole = null;
let judgeCount = 0;
let juryCount = 0;

function log(event) {
  if (!LOG_FILE) return;
  appendFileSync(
    LOG_FILE,
    JSON.stringify({ pid: process.pid, event, sessionId: currentSessionId, role: currentRole }) +
      "\n",
  );
}

function detectRole(text) {
  if (text.includes("NORTH STAR DEFINER")) return "definer";
  if (text.includes("PROGRESS JUDGE")) return "judge";
  if (text.includes("INDEPENDENT FINAL JUROR")) return "jury";
  return "unknown";
}

function jsonFor(role) {
  if (role === "definer")
    return {
      vision: "A tiny script whose output says STATUS: finished.",
      experience: ["running it prints STATUS: finished"],
      quality_bar: "the literal text STATUS: finished",
      avoid: ["STATUS: unfinished"],
      guidance: { reasoning: "none needed", recommendations: [], strength: "light" },
    };
  if (role === "judge") {
    judgeCount += 1;
    if (FORCE_FINAL || judgeCount > 1) {
      return {
        verdict: "FINAL_CANDIDATE",
        assessment: "looks finished",
        critical_gaps: [],
        next_direction: "send to jury",
        confidence: 0.8,
      };
    }
    return {
      verdict: "CONTINUE",
      assessment: "still unfinished",
      critical_gaps: ["output still says unfinished"],
      next_direction: "make it say finished",
      confidence: 0.6,
    };
  }
  // jury
  juryCount += 1;
  if (JURY_FAIL_FIRST && juryCount <= 3) {
    return { verdict: "FAIL", reason: "not ready yet", critical_gaps: ["output unclear"] };
  }
  return { verdict: "PASS", reason: "good", critical_gaps: [] };
}

app.onRequest(acp.methods.agent.initialize, () =>
  Promise.resolve({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: {},
    promptCapabilities: { supportedContentTypes: [{ type: "text" }] },
  }),
);

app.onRequest(acp.methods.agent.session.new, () => {
  sessionCounter += 1;
  currentSessionId = `sess-${sessionCounter}`;
  log("new");
  return Promise.resolve({ sessionId: currentSessionId });
});

app.onRequest(acp.methods.agent.session.prompt, async (ctx) => {
  const text = ctx.params.prompt.map((b) => (b.type === "text" ? b.text : "")).join("");
  currentRole = detectRole(text);
  log("prompt");
  const payload = JSON.stringify(jsonFor(currentRole));
  await ctx.client.notify(acp.methods.client.session.update, {
    sessionId: currentSessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: payload },
    },
  });
  return { stopReason: "end_turn" };
});

app.onRequest(acp.methods.agent.session.close, () => {
  log("close");
  return Promise.resolve({});
});

const stream = acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin));
app
  .connectWith(stream, async () => {
    await new Promise(() => {});
  })
  .catch(() => process.exit(0));
