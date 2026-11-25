import { GoogleGenAI, type Part } from '@google/genai';
import { Logger } from '@nestjs/common';

import {
  type AiProvider,
  type AiRequest,
  type AiStreamChunk,
  AiUnavailableError,
  type AiUsage,
  collectStream,
} from './ai-provider';

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 90_000;

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === undefined) return true; // network / timeout
  return status === 429 || status >= 500;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gemini via `@google/genai`. Streaming JSON with a response schema; retries transient failures
 * (429 / 5xx / network) with backoff before the first byte arrives. Prompt and image content are
 * never logged.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI | null;

  constructor(apiKey: string | undefined) {
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async *stream(request: AiRequest): AsyncIterable<AiStreamChunk> {
    if (!this.client) throw new AiUnavailableError('Gemini is not configured');
    const parts: Part[] = [
      ...(request.images ?? []).map((image) => ({
        inlineData: { mimeType: image.mimeType, data: image.data.toString('base64') },
      })),
      { text: request.prompt },
    ];

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
      let yielded = false;
      try {
        const started = Date.now();
        const response = await this.client.models.generateContentStream({
          model: request.model,
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
          `task=${request.task} model=${request.model} in=${usage.inputTokens} out=${usage.outputTokens} ms=${Date.now() - started}`,
        );
        yield { usage };
        return;
      } catch (error) {
        lastError = error;
        if (request.signal?.aborted) throw error;
        // Once output has streamed, a retry would duplicate rows: surface the failure instead.
        if (yielded || !isRetryable(error) || attempt === MAX_ATTEMPTS) break;
        this.logger.warn(`task=${request.task} attempt ${attempt} failed; retrying`);
        await sleep(800 * 2 ** (attempt - 1));
      }
    }
    const status = (lastError as { status?: number } | null)?.status;
    throw new AiUnavailableError(`Gemini request failed${status ? ` (${status})` : ''}`, lastError);
  }

  generate(request: AiRequest): Promise<{ text: string; usage: AiUsage }> {
    return collectStream(this.stream(request));
  }
}
