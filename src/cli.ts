#!/usr/bin/env node
import { access } from "node:fs/promises";
import { delimiter } from "node:path";
import { Command } from "commander";
import { chromium } from "playwright";
import { SetpointEngine } from "./engine.js";
import { createRuntime } from "./factory.js";
import { initConfig, loadConfig, type SetpointConfig } from "./config.js";
import { RunStorage } from "./storage.js";

const program = new Command();
program.name("setpoint").description("Outcome control for coding agents.").version("0.1.0");
program
  .command("init")
  .description("Create a minimal setpoint.yaml")
  .option("-c, --config <path>", "config path", "setpoint.yaml")
  .action(async ({ config }) => {
    const result = await initConfig(config);
    console.log(result === "created" ? `Created ${config}` : `${config} already exists`);
  });
program
  .command("run")
  .description("Run the Setpoint autopilot loop")
  .option("-c, --config <path>", "config path", "setpoint.yaml")
  .action(async ({ config: configPath }) => {
    const config = await loadConfig(configPath);
    const runtime = createRuntime(config);
    const engine = new SetpointEngine(config, {
      ...runtime,
      onEvent: (message) => console.log(`[setpoint] ${message}`),
    });
    const result = await engine.run();
    console.log(`\nRun: ${result.record.id}`);
    console.log(`State: ${result.record.phase.toUpperCase()}`);
    if (!result.passed) process.exitCode = 2;
  });
program
  .command("inspect")
  .description("Show the latest Setpoint run")
  .option("-c, --config <path>", "config path", "setpoint.yaml")
  .action(async ({ config: configPath }) => {
    const config = await loadConfig(configPath);
    const record = await RunStorage.readLatest(config.run_dir);
    if (!record) {
      console.log("No Setpoint runs found.");
      return;
    }
    console.log(JSON.stringify(record, null, 2));
  });
program
  .command("doctor")
  .description("Validate local Setpoint prerequisites")
  .option("-c, --config <path>", "config path", "setpoint.yaml")
  .action(async ({ config: configPath }) => {
    const checks: Array<[string, boolean, string]> = [];
    let config: SetpointConfig | null = null;
    try {
      config = await loadConfig(configPath);
    } catch (e) {
      checks.push([
        "config",
        false,
        e instanceof Error && e.message.startsWith("ENOENT")
          ? `${configPath} not found (run \`setpoint init\`)`
          : e instanceof Error
            ? e.message
            : String(e),
      ]);
      for (const [name, ok, detail] of checks) console.log(`${ok ? "✓" : "✗"} ${name}: ${detail}`);
      process.exitCode = 1;
      return;
    }

    checks.push([
      "coder agent",
      await commandExists(config.agent.command),
      `${config.agent.command} on PATH`,
    ]);

    if (config.models.provider === "openai") {
      checks.push([
        config.models.api_key_env,
        Boolean(process.env[config.models.api_key_env]),
        `environment variable ${config.models.api_key_env}`,
      ]);
    } else {
      const evaluatorCommands = new Set<string>([
        config.models.command ?? config.agent.command,
        ...Object.values(config.models.profiles)
          .map((profile) => profile.command)
          .filter((command): command is string => Boolean(command)),
      ]);
      for (const command of evaluatorCommands) {
        checks.push([
          "reasoning agent",
          await commandExists(command),
          `${command} on PATH (fresh definer/judge/jury sessions)`,
        ]);
      }
    }

    if (config.observer.type === "browser") {
      let browserExists = false;
      try {
        await access(chromium.executablePath());
        browserExists = true;
      } catch {
        browserExists = false;
      }
      checks.push([
        "chromium",
        browserExists,
        browserExists ? "Playwright Chromium installed" : "run: npx playwright install chromium",
      ]);
    }
    for (const [name, ok, detail] of checks) console.log(`${ok ? "✓" : "✗"} ${name}: ${detail}`);
    if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
  });
program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
async function commandExists(command: string): Promise<boolean> {
  if (command.includes("/") || command.includes("\\")) {
    try {
      await access(command);
      return true;
    } catch {
      return false;
    }
  }
  const path = process.env.PATH ?? "";
  const suffixes = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of path.split(delimiter))
    for (const suffix of suffixes) {
      try {
        await access(`${dir}/${command}${suffix}`);
        return true;
      } catch {
        /* command not found in this directory */
      }
    }
  return false;
}
