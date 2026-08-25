import { extname } from "node:path";
import type { SetpointConfig } from "./config.js";
import {
  JUDGMENT_JSON_SCHEMA,
  JURY_JSON_SCHEMA,
  NORTH_STAR_JSON_SCHEMA,
  judgmentZ,
  juryVerdictZ,
  northStarZ,
} from "./schemas.js";
import {
  continueCoderPrompt,
  idealDefinerPrompt,
  initialCoderPrompt,
  judgePrompt,
  juryFailureCoderPrompt,
  juryPrompt,
} from "./prompts.js";
import { RunStorage } from "./storage.js";
import type {
  CodingAgent,
  Judgment,
  JuryVerdict,
  NorthStar,
  Observer,
  RunPhase,
  RunRecord,
  StructuredModel,
} from "./types.js";

export interface EngineDependencies {
  model: StructuredModel;
  agent: CodingAgent;
  observer: Observer;
  storage: RunStorage;
  cwd: string;
  onEvent?: (message: string) => void;
}
export interface EngineResult {
  passed: boolean;
  record: RunRecord;
  northStar: NorthStar;
}

export class SetpointEngine {
  constructor(
    private readonly config: SetpointConfig,
    private readonly deps: EngineDependencies,
  ) {}
  async run(): Promise<EngineResult> {
    await this.deps.storage.init();
    const now = new Date().toISOString();
    const record: RunRecord = {
      id: this.deps.storage.id,
      phase: "defining",
      iteration: 0,
      started_at: now,
      updated_at: now,
    };
    await this.persist(record);
    let northStar: NorthStar | undefined;
    let observerStarted = false;
    try {
      this.event("DEFINE  Creating frozen North Star");
      const rawNorthStar = await this.deps.model.completeJson<NorthStar>({
        model: this.config.models.ideal_definer,
        prompt: idealDefinerPrompt(this.config.task, this.config.prompts.ideal_definer),
        schemaName: "setpoint_north_star",
        schema: NORTH_STAR_JSON_SCHEMA as unknown as Record<string, unknown>,
      });
      northStar = northStarZ.parse(rawNorthStar);
      record.north_star_path = await this.deps.storage.writeJson("north-star.json", northStar);
      await this.persist(record);
      this.event("CODER   Starting ACP coding session");
      await this.transition(record, "coding");
      await this.deps.agent.start(this.deps.cwd);
      record.agent_session_id = this.deps.agent.sessionId();
      await this.persist(record);
      let nextPrompt = initialCoderPrompt(this.config.task, northStar, this.config.prompts.coder);
      for (let iteration = 1; iteration <= this.config.autopilot.max_iterations; iteration++) {
        record.iteration = iteration;
        await this.transition(record, "coding");
        this.event(`CODER   Iteration ${iteration}/${this.config.autopilot.max_iterations}`);
        const turn = await this.deps.agent.prompt(nextPrompt);
        await this.deps.storage.writeJson(`turns/${pad(iteration)}.json`, turn);
        if (!observerStarted) {
          this.event("OBSERVE Starting product observer");
          await this.deps.observer.start();
          observerStarted = true;
        }
        await this.transition(record, "observing");
        this.event("OBSERVE Capturing actual product state");
        const observation = await this.deps.observer.capture(iteration, this.deps.storage.runDir);
        record.last_observation_path = await this.deps.storage.writeJson(
          `observations/${pad(iteration)}.json`,
          observation,
        );
        await this.persist(record);
        await this.transition(record, "judging");
        this.event("JUDGE   Comparing reality to North Star");
        const rawJudgment = await this.deps.model.completeJson<Judgment>({
          model: this.config.models.judge,
          prompt: judgePrompt(this.config.task, northStar, observation, this.config.prompts.judge),
          schemaName: "setpoint_progress_judgment",
          schema: JUDGMENT_JSON_SCHEMA as unknown as Record<string, unknown>,
          imagePaths: imageArtifacts(observation.artifacts),
        });
        const judgment = judgmentZ.parse(rawJudgment);
        record.last_judgment_path = await this.deps.storage.writeJson(
          `judgments/${pad(iteration)}.json`,
          judgment,
        );
        await this.persist(record);
        if (judgment.verdict === "CONTINUE") {
          this.event(`JUDGE   CONTINUE — ${firstLine(judgment.next_direction)}`);
          nextPrompt = continueCoderPrompt(northStar, judgment, this.config.prompts.coder);
          continue;
        }
        await this.transition(record, "jury");
        this.event(
          `JURY    Final candidate — spawning ${this.config.models.jury.length} fresh jurors`,
        );
        const verdicts = await Promise.all(
          this.config.models.jury.map(async (modelName, index) => {
            const raw = await this.deps.model.completeJson<JuryVerdict>({
              model: modelName,
              prompt: juryPrompt(
                this.config.task,
                northStar!,
                observation,
                this.config.prompts.jury,
              ),
              schemaName: `setpoint_jury_${index + 1}`,
              schema: JURY_JSON_SCHEMA as unknown as Record<string, unknown>,
              imagePaths: imageArtifacts(observation.artifacts),
            });
            return juryVerdictZ.parse(raw);
          }),
        );
        await this.deps.storage.writeJson(`jury/${pad(iteration)}.json`, verdicts);
        if (juryPasses(verdicts, this.config.autopilot.require_unanimous_jury)) {
          record.final_reason = verdicts.map((v) => v.reason).join(" | ");
          await this.transition(record, "done");
          this.event("PASS    North Star reached");
          return { passed: true, record, northStar };
        }
        this.event("JURY    FAIL — returning consolidated criticism to coder");
        nextPrompt = juryFailureCoderPrompt(northStar, verdicts, this.config.prompts.coder);
      }
      record.final_reason = `Maximum iterations (${this.config.autopilot.max_iterations}) reached without jury pass.`;
      await this.transition(record, "failed");
      this.event("STOP    Maximum iterations reached");
      return { passed: false, record, northStar };
    } catch (error) {
      record.final_reason = error instanceof Error ? error.message : String(error);
      await this.transition(record, "failed");
      throw error;
    } finally {
      if (observerStarted) await this.deps.observer.close().catch(() => undefined);
      await this.deps.agent.close().catch(() => undefined);
    }
  }
  private async transition(record: RunRecord, phase: RunPhase): Promise<void> {
    record.phase = phase;
    await this.persist(record);
  }
  private async persist(record: RunRecord): Promise<void> {
    record.updated_at = new Date().toISOString();
    await this.deps.storage.writeRun(record);
  }
  private event(message: string): void {
    this.deps.onEvent?.(message);
  }
}
function juryPasses(verdicts: JuryVerdict[], unanimous: boolean): boolean {
  const passes = verdicts.filter((v) => v.verdict === "PASS").length;
  return unanimous ? passes === verdicts.length : passes > verdicts.length / 2;
}
function imageArtifacts(paths: string[]): string[] {
  return paths.filter((path) =>
    [".png", ".jpg", ".jpeg", ".webp"].includes(extname(path).toLowerCase()),
  );
}
function pad(value: number): string {
  return String(value).padStart(3, "0");
}
function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.slice(0, 140) ?? "continue";
}
