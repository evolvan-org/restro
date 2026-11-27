import { GoogleGenAI, type Part, PartMediaResolutionLevel } from '@google/genai';
import { Logger } from '@nestjs/common';

import {
  AI_STREAM_RESUME_ATTEMPTS,
  type AiProvider,
  type AiRequest,
  type AiStreamChunk,
  AiStreamInterruptedError,
  AiUnavailableError,
  type AiUsage,
  collectStream,
  resumeDelay,
} from './ai-provider';

const MAX_ATTEMPTS = 4;
/** How long an overloaded model is skipped in favour of the request's fallback. */
const OVERLOAD_COOLDOWN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 90_000;

/** Google's "high demand" answers, and streams cut mid-response (how overload shows mid-stream). */
function isOverload(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === undefined || status === 429 || status === 503;
}

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === undefined) return true; // network / timeout
  return status === 429 || status >= 500;
}

/**
 * Google's own explanation of a failed call ("model ... is no longer available", "API key not
 * valid"). The SDK wraps the JSON error body in `message`, sometimes twice; this unwraps it. These
 * messages never echo prompt or image content, so they are safe to log.
 */
export function geminiErrorMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const parsed = JSON.parse(message) as { error?: { message?: unknown } };
      if (typeof parsed.error?.message !== 'string') break;
      message = parsed.error.message;
    } catch {
      break;
    }
  }
  message = message.replace(/\s+/g, ' ').trim();
  if (!message || message === '{}') {
    const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
    message = [name, code].filter((part) => typeof part === 'string').join(' ') || 'unknown error';
  }
  return message.slice(0, 500);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gemini via `@google/genai`. Streaming JSON with a response schema; retries transient failures
 * (429 / 5xx / network) with backoff before the first byte arrives. A stream that drops after
 * output has started throws `AiStreamInterruptedError` for the caller to resume. A model that
 * reports overload is skipped for a minute in favour of the request's `fallbackModel`. Prompt and
 * image content are never logged.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI | null;
  /** Model → time until which it is treated as overloaded. */
  private readonly overloadedUntil = new Map<string, number>();

  constructor(apiKey: string | undefined) {
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  private overloaded(model: string): boolean {
    return (this.overloadedUntil.get(model) ?? 0) > Date.now();
  }

  /** The request's model, or its fallback while the model is overloaded and the fallback isn't. */
  private pickModel(request: AiRequest): string {
    const { model, fallbackModel } = request;
    if (fallbackModel && this.overloaded(model) && !this.overloaded(fallbackModel)) {
      return fallbackModel;
    }
    return model;
  }

  private noteFailure(model: string, error: unknown): void {
    if (!isOverload(error)) return;
    if (!this.overloaded(model)) {
      this.logger.warn(`model=${model} overloaded; using fallbacks for the next minute`);
    }
    this.overloadedUntil.set(model, Date.now() + OVERLOAD_COOLDOWN_MS);
  }

  async *stream(request: AiRequest): AsyncIterable<AiStreamChunk> {
    if (!this.client) throw new AiUnavailableError('Gemini is not configured');
    const parts: Part[] = [
      ...(request.images ?? []).map((image) => ({
        inlineData: { mimeType: image.mimeType, data: image.data.toString('base64') },
        ...(request.imageDetail === 'ultra' && {
          mediaResolution: { level: PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH },
        }),
      })),
      { text: request.prompt },
    ];

    let lastError: unknown;
    let model = request.model;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      model = this.pickModel(request);
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
      let yielded = false;
      try {
        const started = Date.now();
        const response = await this.client.models.generateContentStream({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: request.system,
            responseMimeType: 'application/json',
            responseSchema: request.responseSchema,
            temperature: request.temperature ?? 0.1,
            abortSignal: signal,
          },
        });
        let usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
        for await (const chunk of response) {
          const text = chunk.text;
          if (text) {
            yielded = true;
            yield { text };
          }
          if (chunk.usageMetadata) {
            usage = {
              inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
              outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
            };
          }
        }
        this.logger.log(
          `task=${request.task} model=${model}${request.imageDetail === 'ultra' ? ' detail=ultra' : ''} in=${usage.inputTokens} out=${usage.outputTokens} ms=${Date.now() - started}`,
        );
        yield { usage };
        return;
      } catch (error) {
        lastError = error;
        if (request.signal?.aborted) throw error;
        this.noteFailure(model, error);
        // Once output has streamed, a retry here would repeat it: the caller resumes instead.
        if (yielded && isRetryable(error)) {
          this.logger.warn(
            `task=${request.task} model=${model} stream interrupted: ${geminiErrorMessage(error)}`,
          );
          throw new AiStreamInterruptedError('Gemini stream interrupted', error);
        }
        if (yielded || !isRetryable(error) || attempt === MAX_ATTEMPTS) break;
        this.logger.warn(
          `task=${request.task} model=${model} attempt ${attempt} failed; retrying: ${geminiErrorMessage(error)}`,
        );
        await sleep(800 * 2 ** (attempt - 1));
      }
    }
    const status = (lastError as { status?: number } | null)?.status;
    this.logger.error(
      `task=${request.task} model=${model} failed${status ? ` (${status})` : ''}: ${geminiErrorMessage(lastError)}`,
    );
    throw new AiUnavailableError(`Gemini request failed${status ? ` (${status})` : ''}`, lastError);
  }

  /** Whole response at once; an interrupted stream is simply asked again (nothing was used yet). */
  async generate(request: AiRequest): Promise<{ text: string; usage: AiUsage }> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await collectStream(this.stream(request));
      } catch (error) {
        if (!(error instanceof AiStreamInterruptedError) || attempt >= AI_STREAM_RESUME_ATTEMPTS) {
          throw error;
        }
        await resumeDelay(attempt);
      }
    }
  }
}
