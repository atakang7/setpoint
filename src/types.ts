export type RunPhase = "defining" | "coding" | "observing" | "judging" | "jury" | "done" | "failed";

export interface NorthStar {
  vision: string;
  experience: string[];
  quality_bar: string;
  avoid: string[];
  guidance: {
    reasoning: string;
    recommendations: string[];
    strength: "light" | "moderate" | "strong";
  };
}

export interface Observation {
  kind: "browser" | "command";
  summary: string;
  artifacts: string[];
  metadata: Record<string, unknown>;
}

export interface Judgment {
  verdict: "CONTINUE" | "FINAL_CANDIDATE";
  assessment: string;
  critical_gaps: string[];
  next_direction: string;
  confidence: number;
}

export interface JuryVerdict {
  verdict: "PASS" | "FAIL";
  reason: string;
  critical_gaps: string[];
}

export interface RunRecord {
  id: string;
  phase: RunPhase;
  iteration: number;
  started_at: string;
  updated_at: string;
  agent_session_id?: string;
  north_star_path?: string;
  last_observation_path?: string;
  last_judgment_path?: string;
  final_reason?: string;
}

export interface PromptTurnResult {
  stopReason: string;
  text: string;
}

export interface CodingAgent {
  start(cwd: string): Promise<void>;
  prompt(text: string): Promise<PromptTurnResult>;
  sessionId(): string | undefined;
  close(): Promise<void>;
}

export interface Observer {
  start(): Promise<void>;
  capture(iteration: number, outputDir: string): Promise<Observation>;
  close(): Promise<void>;
}

export interface StructuredModel {
  completeJson<T>(options: {
    model: string;
    prompt: string;
    schemaName: string;
    schema: Record<string, unknown>;
    imagePaths?: string[];
  }): Promise<T>;
}
