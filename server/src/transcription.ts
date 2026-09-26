import { createReadStream } from 'node:fs';

import OpenAI from 'openai';

export interface TranscriptionResult {
  transcript: string;
  language: string;
}

export interface TranscriptionProvider {
  transcribe(path: string): Promise<TranscriptionResult>;
}

export class TranscriptionProviderError extends Error {
  constructor(readonly kind: 'unusable' | 'rate_limited' | 'temporary') {
    super('Transcription failed');
    this.name = 'TranscriptionProviderError';
  }
}

interface OpenAITranscriptionShape {
  text?: unknown;
  language?: unknown;
  languages?: { code?: unknown }[];
}

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly #client: OpenAI;
  readonly #timeoutMs: number;

  constructor(apiKey: string, timeoutMs: number) {
    this.#client = new OpenAI({ apiKey });
    this.#timeoutMs = timeoutMs;
  }

  async transcribe(path: string): Promise<TranscriptionResult> {
    try {
      const response = (await this.#client.audio.transcriptions.create(
        {
          file: createReadStream(path),
          model: 'gpt-4o-transcribe',
          response_format: 'json',
        },
        { timeout: this.#timeoutMs },
      )) as OpenAITranscriptionShape;
      if (typeof response.text !== 'string' || response.text.length === 0)
        throw new TranscriptionProviderError('unusable');
      const detected =
        typeof response.language === 'string'
          ? response.language
          : response.languages?.find(
              (language) => typeof language.code === 'string',
            )?.code;
      return {
        transcript: response.text,
        language: typeof detected === 'string' ? detected : 'und',
      };
    } catch (error: unknown) {
      if (error instanceof TranscriptionProviderError) throw error;
      if (error instanceof OpenAI.APIError) {
        if (error.status === 429)
          throw new TranscriptionProviderError('rate_limited');
        if (error.status === 400 || error.status === 422)
          throw new TranscriptionProviderError('unusable');
      }
      throw new TranscriptionProviderError('temporary');
    }
  }
}

export const unavailableTranscriptionProvider: TranscriptionProvider = {
  transcribe: () => Promise.reject(new TranscriptionProviderError('temporary')),
};

export class AccountRateLimiter {
  readonly #requests = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  consume(accountId: string): boolean {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const current = (this.#requests.get(accountId) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (current.length >= this.limit) {
      this.#requests.set(accountId, current);
      return false;
    }
    current.push(now);
    this.#requests.set(accountId, current);
    return true;
  }
}

export interface IdempotentTranscription {
  requestHash: string;
  result: { transcript: string; durationSeconds: number; language: string };
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key was already used for a different request');
    this.name = 'IdempotencyConflictError';
  }
}

export class TranscriptionIdempotencyStore {
  readonly #records = new Map<string, IdempotentTranscription>();
  readonly #pending = new Map<
    string,
    { requestHash: string; promise: Promise<IdempotentTranscription['result']> }
  >();

  async run(
    accountId: string,
    key: string,
    requestHash: string,
    operation: () => Promise<IdempotentTranscription['result']>,
  ): Promise<IdempotentTranscription['result']> {
    const storageKey = `${accountId}:${key}`;
    const existing = this.#records.get(storageKey);
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new IdempotencyConflictError();
      return existing.result;
    }
    const pending = this.#pending.get(storageKey);
    if (pending) {
      if (pending.requestHash !== requestHash)
        throw new IdempotencyConflictError();
      return pending.promise;
    }
    const promise = operation();
    this.#pending.set(storageKey, { requestHash, promise });
    try {
      const result = await promise;
      this.#records.set(storageKey, { requestHash, result });
      return result;
    } finally {
      this.#pending.delete(storageKey);
    }
  }
}
