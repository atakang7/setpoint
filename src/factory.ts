import { resolve } from "node:path";
import type { SetpointConfig } from "./config.js";
import { AcpCodingAgent } from "./agent/acp.js";
import { OpenAIStructuredModel } from "./llm/openai.js";
import { BrowserObserver } from "./observer/browser.js";
import { CommandObserver } from "./observer/command.js";
import { RunStorage } from "./storage.js";
import type { Observer } from "./types.js";

export function createRuntime(config: SetpointConfig, cwd = process.cwd()) {
  const apiKey = process.env[config.models.api_key_env];
  if (!apiKey)
    throw new Error(`Missing ${config.models.api_key_env}. Set it before running Setpoint.`);
  const model = new OpenAIStructuredModel({ apiKey, baseURL: config.models.base_url });
  const agent = new AcpCodingAgent({
    command: config.agent.command,
    args: config.agent.args,
    env: config.agent.env,
    permissions: config.agent.permissions,
  });
  let observer: Observer;
  if (config.observer.type === "browser") {
    observer = new BrowserObserver({
      url: config.observer.url,
      startCommand: config.observer.start_command,
      readyTimeoutMs: config.observer.ready_timeout_ms,
      fullPage: config.observer.full_page,
      viewports: config.observer.viewports,
      cwd: resolve(cwd),
    });
  } else {
    observer = new CommandObserver({
      command: config.observer.command,
      timeoutMs: config.observer.timeout_ms,
      cwd: resolve(cwd),
    });
  }
  return {
    model,
    agent,
    observer,
    storage: new RunStorage(config.run_dir, cwd),
    cwd: resolve(cwd),
  };
}
