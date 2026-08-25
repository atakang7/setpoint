import { z } from "zod";

export const northStarZ = z.object({
  vision: z.string().min(1),
  experience: z.array(z.string().min(1)).min(1),
  quality_bar: z.string().min(1),
  avoid: z.array(z.string().min(1)),
  guidance: z.object({
    reasoning: z.string(),
    recommendations: z.array(z.string()),
    strength: z.enum(["light", "moderate", "strong"]),
  }),
});

export const judgmentZ = z.object({
  verdict: z.enum(["CONTINUE", "FINAL_CANDIDATE"]),
  assessment: z.string().min(1),
  critical_gaps: z.array(z.string()),
  next_direction: z.string(),
  confidence: z.number().min(0).max(1),
});

export const juryVerdictZ = z.object({
  verdict: z.enum(["PASS", "FAIL"]),
  reason: z.string().min(1),
  critical_gaps: z.array(z.string()),
});

export const NORTH_STAR_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    vision: { type: "string" },
    experience: { type: "array", items: { type: "string" } },
    quality_bar: { type: "string" },
    avoid: { type: "array", items: { type: "string" } },
    guidance: {
      type: "object", additionalProperties: false,
      properties: {
        reasoning: { type: "string" },
        recommendations: { type: "array", items: { type: "string" } },
        strength: { type: "string", enum: ["light", "moderate", "strong"] }
      },
      required: ["reasoning", "recommendations", "strength"]
    }
  },
  required: ["vision", "experience", "quality_bar", "avoid", "guidance"]
} as const;

export const JUDGMENT_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["CONTINUE", "FINAL_CANDIDATE"] },
    assessment: { type: "string" },
    critical_gaps: { type: "array", items: { type: "string" } },
    next_direction: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["verdict", "assessment", "critical_gaps", "next_direction", "confidence"]
} as const;

export const JURY_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["PASS", "FAIL"] },
    reason: { type: "string" },
    critical_gaps: { type: "array", items: { type: "string" } }
  },
  required: ["verdict", "reason", "critical_gaps"]
} as const;
