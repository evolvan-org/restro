/**
 * The one seam between the app and an AI model. Callers ask for JSON matching a schema; adapters
 * (Gemini, the fake used in dev/CI/demos) handle transport. Keys never leave the server.
 */

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/** What a request is for: adapters may use it (the fake picks canned output by it). */
export type AiTask = 'menu-page' | 'invoice-page' | 'recipes' | 'ingredient-prices';

export type AiImage = { mimeType: string; data: Buffer };

export type AiUsage = { inputTokens: number; outputTokens: number };

export type AiRequest = {
  task: AiTask;
  model: string;
  system: string;
  prompt: string;
  images?: readonly AiImage[];
  /** OpenAPI-subset schema for the JSON response. */
  responseSchema: Record<string, unknown>;
  temperature?: number;
  signal?: AbortSignal;
};

export type AiStreamChunk = { text: string } | { usage: AiUsage };

export interface AiProvider {
  readonly name: string;
  /** False when unconfigured (e.g. no API key): callers report AI_UNAVAILABLE. */
  isAvailable(): boolean;
  /** Streams the JSON text as it is generated, then one usage chunk. */
  stream(request: AiRequest): AsyncIterable<AiStreamChunk>;
  generate(request: AiRequest): Promise<{ text: string; usage: AiUsage }>;
}

/** The provider failed in a way retrying won't fix soon (outage, quota, auth). */
export class AiUnavailableError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/** Collects a stream into text + usage (for callers that don't need incremental output). */
export async function collectStream(
  stream: AsyncIterable<AiStreamChunk>,
): Promise<{ text: string; usage: AiUsage }> {
  let text = '';
  let usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
  for await (const chunk of stream) {
    if ('text' in chunk) text += chunk.text;
    else usage = chunk.usage;
  }
  return { text, usage };
}
