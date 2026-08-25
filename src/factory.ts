import { resolve } from "node:path";
import type { SetpointConfig } from "./config.js";
import { AcpCodingAgent } from "./agent/acp.js";
import { AgentStructuredModel } from "./llm/agent.js";
import { OpenAIStructuredModel } from "./llm/openai.js";
import { BrowserObserver } from "./observer/browser.js";
import { CommandObserver } from "./observer/command.js";
import { RunStorage } from "./storage.js";
import type { Observer, StructuredModel } from "./types.js";

export function createRuntime(config: SetpointConfig, cwd = process.cwd()) {
  const resolvedCwd = resolve(cwd);
  const agent = new AcpCodingAgent({
    command: config.agent.command,
    args: config.agent.args,
    env: config.agent.env,
    permissions: config.agent.permissions,
  });

  let model: StructuredModel;
  if (config.models.provider === "agent") {
    model = new AgentStructuredModel({
      cwd: resolvedCwd,
      base: {
        command: config.models.command ?? config.agent.command,
        args: config.models.args ?? config.agent.args,
        env: { ...config.agent.env, ...config.models.env },
        permissions: config.models.permissions,
      },
      profiles: config.models.profiles,
    });
  } else {
    const apiKey = process.env[config.models.api_key_env];
    if (!apiKey)
      throw new Error(`Missing ${config.models.api_key_env}. Set it before running Setpoint.`);
    model = new OpenAIStructuredModel({ apiKey, baseURL: config.models.base_url });
  }

  let observer: Observer;
  if (config.observer.type === "browser") {
    observer = new BrowserObserver({
      url: config.observer.url,
      startCommand: config.observer.start_command,
      readyTimeoutMs: config.observer.ready_timeout_ms,
      fullPage: config.observer.full_page,
      viewports: config.observer.viewports,
      cwd: resolvedCwd,
    });
  } else {
    observer = new CommandObserver({
      command: config.observer.command,
      timeoutMs: config.observer.timeout_ms,
      cwd: resolvedCwd,
    });
  }
  return {
    model,
    agent,
    observer,
    storage: new RunStorage(config.run_dir, cwd),
    cwd: resolvedCwd,
  };
}
