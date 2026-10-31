import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export interface TranscriptionResult {
  transcript: string;
  language: string;
}

export interface TranscriptionProvider {
  transcribe(
    path: string,
    durationSeconds: number,
  ): Promise<TranscriptionResult>;
}

export class TranscriptionProviderError extends Error {
  constructor(readonly kind: 'unusable' | 'rate_limited' | 'temporary') {
    super('Transcription failed');
    this.name = 'TranscriptionProviderError';
  }
}

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
const SARVAM_MODEL = 'saaras:v4';
// Sarvam's synchronous endpoint rejects audio over 30 seconds; longer
// recordings go through the batch job API (up to 2 hours per file).
export const SARVAM_SYNC_MAX_SECONDS = 30;
const SARVAM_BATCH_POLL_MS = 2_000;
// Batch jobs sniff the format from the stored content type and mis-decode
// AAC uploaded as application/octet-stream into an empty transcript.
const AUDIO_MIME_TYPES: Record<string, string> = {
  '.m4a': 'audio/x-m4a',
  '.mp4': 'audio/mp4',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.mpeg': 'audio/mpeg',
  '.mp3': 'audio/mpeg',
};

function audioMimeType(path: string): string {
  return (
    AUDIO_MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
  );
}

interface SarvamTranscriptShape {
  transcript?: unknown;
  language_code?: unknown;
}

interface SarvamJobShape {
  job_id: string;
  job_state: string;
  job_details?: { state?: string; outputs?: { file_name: string }[] }[];
  upload_urls?: Record<string, { file_url: string }>;
  download_urls?: Record<string, { file_url: string }>;
}

/** Saaras v4 speech-to-text (https://docs.sarvam.ai/api/getting-started/models/saaras). */
export class SarvamTranscriptionProvider implements TranscriptionProvider {
  readonly #apiKey: string;
  readonly #timeoutMs: number;

  constructor(apiKey: string, timeoutMs: number) {
    this.#apiKey = apiKey;
    this.#timeoutMs = timeoutMs;
  }

  async transcribe(
    path: string,
    durationSeconds: number,
  ): Promise<TranscriptionResult> {
    const signal = AbortSignal.timeout(this.#timeoutMs);
    try {
      const response =
        durationSeconds <= SARVAM_SYNC_MAX_SECONDS
          ? await this.#transcribeSync(path, signal)
          : await this.#transcribeBatch(path, signal);
      const transcript =
        typeof response.transcript === 'string'
          ? response.transcript.trim()
          : '';
      if (transcript.length === 0)
        throw new TranscriptionProviderError('unusable');
      return {
        transcript,
        language:
          typeof response.language_code === 'string'
            ? response.language_code
            : 'und',
      };
    } catch (error: unknown) {
      if (error instanceof TranscriptionProviderError) throw error;
      throw new TranscriptionProviderError('temporary');
    }
  }

  async #transcribeSync(
    path: string,
    signal: AbortSignal,
  ): Promise<SarvamTranscriptShape> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([await readFile(path)], { type: audioMimeType(path) }),
      basename(path),
    );
    form.append('model', SARVAM_MODEL);
    return this.#sarvam<SarvamTranscriptShape>('', form, signal);
  }

  async #transcribeBatch(
    path: string,
    signal: AbortSignal,
  ): Promise<SarvamTranscriptShape> {
    const fileName = basename(path);
    const { job_id } = await this.#sarvam<SarvamJobShape>(
      '/job/v1',
      { job_parameters: { model: SARVAM_MODEL } },
      signal,
    );
    const { upload_urls } = await this.#sarvam<SarvamJobShape>(
      '/job/v1/upload-files',
      { job_id, files: [fileName] },
      signal,
    );
    // Presigned storage URLs never receive the Sarvam key. Without a content
    // type the object is stored as binary/octet-stream, which job start rejects.
    await this.#storage(upload_urls?.[fileName]?.file_url, signal, {
      method: 'PUT',
      headers: {
        'content-type': audioMimeType(path),
        'x-ms-blob-type': 'BlockBlob',
      },
      body: await readFile(path),
    });
    await this.#sarvam(`/job/v1/${job_id}/start`, undefined, signal);

    let job: SarvamJobShape;
    do {
      await sleep(SARVAM_BATCH_POLL_MS, undefined, { signal });
      job = await this.#sarvam<SarvamJobShape>(
        `/job/v1/${job_id}/status`,
        null,
        signal,
      );
    } while (job.job_state !== 'Completed' && job.job_state !== 'Failed');

    const detail = job.job_details?.[0];
    const output = detail?.outputs?.[0]?.file_name;
    if (job.job_state === 'Failed' || detail?.state !== 'Success' || !output)
      throw new TranscriptionProviderError('unusable');
    const { download_urls } = await this.#sarvam<SarvamJobShape>(
      '/job/v1/download-files',
      { job_id, files: [output] },
      signal,
    );
    const result = await this.#storage(
      download_urls?.[output]?.file_url,
      signal,
    );
    return (await result.json()) as SarvamTranscriptShape;
  }

  /** `null` body sends a GET, `undefined` an empty POST. */
  async #sarvam<T>(
    route: string,
    body: FormData | object | null | undefined,
    signal: AbortSignal,
  ): Promise<T> {
    const json =
      body !== null && body !== undefined && !(body instanceof FormData);
    const response = await fetch(`${SARVAM_STT_URL}${route}`, {
      method: body === null ? 'GET' : 'POST',
      headers: {
        'api-subscription-key': this.#apiKey,
        ...(json ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: json ? JSON.stringify(body) : body } : {}),
      signal,
    });
    if (response.status === 429)
      throw new TranscriptionProviderError('rate_limited');
    if (response.status === 400 || response.status === 422)
      throw new TranscriptionProviderError('unusable');
    if (!response.ok) throw new TranscriptionProviderError('temporary');
    return (await response.json()) as T;
  }

  async #storage(
    url: string | undefined,
    signal: AbortSignal,
    init: RequestInit = {},
  ): Promise<Response> {
    if (!url) throw new TranscriptionProviderError('temporary');
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) throw new TranscriptionProviderError('temporary');
    return response;
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
