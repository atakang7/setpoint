import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import OpenAI from "openai";
import type { StructuredModel } from "../types.js";

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
      throw new Error(`Unsupported image type for model input: ${path}`);
  }
}

export class OpenAIStructuredModel implements StructuredModel {
  private readonly client: OpenAI;
  constructor(options: { apiKey: string; baseURL?: string }) {
    this.client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });
  }
  async completeJson<T>(options: {
    model: string;
    prompt: string;
    schemaName: string;
    schema: Record<string, unknown>;
    imagePaths?: string[];
  }): Promise<T> {
    const content: Array<Record<string, unknown>> = [{ type: "input_text", text: options.prompt }];
    for (const path of options.imagePaths ?? []) {
      const bytes = await readFile(path);
      content.push({
        type: "input_image",
        image_url: `data:${mimeFor(path)};base64,${bytes.toString("base64")}`,
      });
    }
    const response = await this.client.responses.create({
      model: options.model,
      input: [{ role: "user", content: content as any }],
      text: {
        format: {
          type: "json_schema",
          name: options.schemaName,
          schema: options.schema,
          strict: true,
        },
      },
    });
    if (!response.output_text)
      throw new Error(`Model ${options.model} returned no structured output`);
    try {
      return JSON.parse(response.output_text) as T;
    } catch (error) {
      throw new Error(
        `Model ${options.model} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
