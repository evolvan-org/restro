/**
 * The one seam between the app and an AI model. Callers ask for JSON matching a schema; adapters
 * (Gemini, the fake used in dev/CI/demos) handle transport. Keys never leave the server.
 */

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/** What a request is for: adapters may use it (the fake picks canned output by it). */
export type AiTask = 'menu-page' | 'invoice-page' | 'recipes';

export type AiImage = { mimeType: string; data: Buffer };

export type AiUsage = { inputTokens: number; outputTokens: number };

export type AiRequest = {
  task: AiTask;
  model: string;
  /** Used while `model` is overloaded (503 / 429 / dropped streams), if set. */
  fallbackModel?: string;
  system: string;
  prompt: string;
  images?: readonly AiImage[];
  /**
   * How much detail the model may spend per image. `ultra` doubles the image token budget (Gemini
   * ULTRA_HIGH: 2240 instead of 1120): used to re-read a page whose first read was poor.
   */
  imageDetail?: 'default' | 'ultra';
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

/**
 * The connection dropped after output had started streaming (Gemini sometimes closes a stream
 * mid-event). Text already yielded is valid but incomplete, so the provider can't retry on its own
 * without repeating it: the caller resumes, skipping what it has already handled. Callers that
 * don't resume treat it like any other unavailability.
 */
export class AiStreamInterruptedError extends AiUnavailableError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AiStreamInterruptedError';
  }
}

/** How many times a caller re-runs an interrupted stream before giving up. */
export const AI_STREAM_RESUME_ATTEMPTS = 4;

/** Backoff before resuming an interrupted stream: 1 s, 2 s, then 4 s. */
export function resumeDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
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
