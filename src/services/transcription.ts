import { z } from 'zod';

import { env } from '@/config/env';
import { openEntryAudio } from '@/features/journal/api';
import type { JournalResult, PlayableAudio } from '@/features/journal/types';
import { usePreferences, voiceStatus, type VoiceStatus } from '@/state/preferences';

// Turns a sealed recording into text through ECHO's voice server (docs/OWNER_DECISIONS.md, D-005).
// Nothing here throws, and nothing here logs: not the audio, not the words, not the address. An
// error is a code and whether trying again could help, in the same shape as the journal's.

export type TranscriptionErrorCode =
  /** The person has not agreed, or chose to keep their voice on the phone. Nothing was sent. */
  | 'consent_required'
  /** No address or token, an unsafe address, or the server says it has no key. */
  | 'not_configured'
  /** The server did not accept the token. */
  | 'unauthorized'
  /** The phone could not reach the server. */
  | 'offline'
  | 'timeout'
  /** The recording is longer than the server takes. */
  | 'too_long'
  /** No speech was heard. */
  | 'no_speech'
  /** The file is not one the server reads. */
  | 'unsupported'
  | 'rate_limited'
  | 'server'
  | 'invalid_response'
  /** The sealed recording could not be opened on this phone. */
  | 'audio_unavailable'
  /** The web preview cannot record or play audio. */
  | 'unavailable'
  | 'cancelled';

export type TranscriptionError = { code: TranscriptionErrorCode; retryable: boolean };
export type TranscriptionResult<T> =
  { ok: true; value: T } | { ok: false; error: TranscriptionError };

export type Transcript = {
  /** The cleaned words. If cleanup failed on the server, the plain transcript. */
  text: string;
  polished: boolean;
  languages: string[];
  seconds: number | null;
};

const fail = <T = never>(
  code: TranscriptionErrorCode,
  retryable = false,
): TranscriptionResult<T> => ({
  ok: false,
  error: { code, retryable },
});

/** About 100 seconds: the server allows 80 for transcription and 25 for cleanup. */
export const TRANSCRIBE_TIMEOUT_MS = 100_000;
export const TRANSCRIBE_PATH = '/api/transcribe';
export const TOKEN_HEADER = 'x-echo-voice-token';

/** What voice-api/api/transcribe.ts accepts, by extension, and the type to send for each. */
const TYPES: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  webm: 'audio/webm',
};

/** What the server takes (voice-api/api/transcribe.ts): about 14 minutes at the recorder's 40 kbps. */
export const MAX_UPLOAD_BYTES = 4_400_000;

const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

/**
 * The server's address, or null when it must not be used. Anything but a phone talking to itself
 * has to be https: a voice never crosses a network in the clear. Parsed by hand, because the URL
 * class is not complete on every React Native runtime, and strict, so that a host like
 * "127.0.0.1.example.com" or "localhost@example.com" cannot pass for a local one.
 */
export function voiceEndpoint(raw: string | undefined): string | null {
  const match = /^(https?):\/\/([^/?#@\s]+)\/?$/i.exec((raw ?? '').trim());
  if (!match) return null;
  const scheme = match[1]!.toLowerCase();
  const authority = match[2]!.toLowerCase();
  const host = authority.replace(/:\d{1,5}$/, '');
  if (host.length === 0 || host.includes(':')) return null;
  if (scheme === 'http' && !LOCAL_HOSTS.includes(host)) return null;
  return `${scheme}://${authority}${TRANSCRIBE_PATH}`;
}

const responseSchema = z.object({
  text: z.string(),
  polished: z.boolean().optional(),
  languages: z.array(z.string()).optional(),
  seconds: z.number().nullable().optional(),
});
const failureSchema = z.object({ code: z.string().optional(), retryable: z.boolean().optional() });

/** From the status alone when the body says nothing useful, and from the server's code when it does. */
function failureFrom(status: number, body: z.infer<typeof failureSchema> | null) {
  const code = body?.code;
  if (status === 401 || status === 403) return fail('unauthorized');
  if (status === 413) return fail('too_long');
  if (status === 415) return fail('unsupported');
  if (status === 422) return code === 'empty' ? fail('no_speech') : fail('unsupported');
  if (status === 429) return fail('rate_limited', true);
  if (status === 503 && code === 'not_configured') return fail('not_configured');
  if (status === 400) return fail('unsupported');
  return fail('server', status >= 500 || body?.retryable === true);
}

export type OpenAudio = (entryId: string) => Promise<JournalResult<PlayableAudio>>;

export type TranscribeOptions = {
  /** Stops the request. The result is then `cancelled`. */
  signal?: AbortSignal;
  /** Where the audio comes from. By default the entry's sealed recording, decrypted for the moment. */
  open?: OpenAudio;
};

export type TranscribeDeps = {
  fetch: typeof fetch;
  url: string | undefined;
  token: string | undefined;
  timeoutMs: number;
  status: () => VoiceStatus;
  /** The recording's size in bytes, or null if it cannot be read. */
  sizeOf: (uri: string) => number | null;
  filePart: (uri: string) => Blob;
};

function sizeOnDisk(uri: string): number | null {
  try {
    // Loaded here so that a screen that merely imports this service works where the native module
    // is missing, such as Jest and the web preview.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File } = require('expo-file-system') as typeof import('expo-file-system');
    const size = new File(uri).size;
    return typeof size === 'number' && size > 0 ? size : null;
  } catch {
    return null;
  }
}

function expoFilePart(uri: string): Blob {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File } = require('expo-file-system') as typeof import('expo-file-system');
  return new File(uri) as unknown as Blob;
}

const defaults = (): TranscribeDeps => ({
  fetch: (input, init) => fetch(input, init),
  filePart: expoFilePart,
  url: env.EXPO_PUBLIC_VOICE_URL,
  token: env.EXPO_PUBLIC_VOICE_TOKEN,
  timeoutMs: TRANSCRIBE_TIMEOUT_MS,
  status: () => voiceStatus(usePreferences.getState().voiceConsent),
  sizeOf: sizeOnDisk,
});

/**
 * Sends an entry's recording to be turned into words. It checks the person's consent itself, so no
 * caller can send a voice that was not agreed to. The decrypted copy of the recording exists only
 * for the length of the request, and is released on every path, success or not.
 */
export async function transcribeEntryAudio(
  entryId: string,
  options: TranscribeOptions = {},
  overrides: Partial<TranscribeDeps> = {},
): Promise<TranscriptionResult<Transcript>> {
  const deps = { ...defaults(), ...overrides };
  if (deps.status() !== 'allowed') return fail('consent_required');
  const endpoint = voiceEndpoint(deps.url);
  if (!endpoint || !deps.token) return fail('not_configured');
  if (options.signal?.aborted) return fail('cancelled');

  let opened: JournalResult<PlayableAudio>;
  try {
    opened = await (options.open ?? openEntryAudio)(entryId);
  } catch {
    return fail('audio_unavailable', true);
  }
  if (!opened.ok) {
    return opened.error.code === 'unavailable'
      ? fail('unavailable')
      : fail('audio_unavailable', true);
  }
  const audio = opened.value;
  try {
    return await upload(audio.uri, endpoint, deps.token, deps, options.signal);
  } finally {
    try {
      audio.release();
    } catch {
      // The launch sweep removes what a failed release leaves behind.
    }
  }
}

async function upload(
  uri: string,
  endpoint: string,
  token: string,
  deps: TranscribeDeps,
  outside: AbortSignal | undefined,
): Promise<TranscriptionResult<Transcript>> {
  const extension = /\.([a-z0-9]+)$/i.exec(uri)?.[1]?.toLowerCase() ?? '';
  const type = TYPES[extension];
  if (!type) return fail('unsupported');
  // Too long for the server: say so now, rather than after sending most of it. The recording stays.
  const bytes = deps.sizeOf(uri);
  if (bytes !== null && bytes > MAX_UPLOAD_BYTES) return fail('too_long');

  // Expo's fetch streams a File from disk. It rejects React Native's { uri, name, type } parts, as
  // "Unsupported FormDataPart implementation", which only shows on a device.
  const form = new FormData();
  form.append('file', deps.filePart(uri), `speech.${extension}`);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deps.timeoutMs);
  const stop = () => controller.abort();
  outside?.addEventListener('abort', stop);
  if (outside?.aborted) stop();

  try {
    const response = await deps.fetch(endpoint, {
      method: 'POST',
      headers: { [TOKEN_HEADER]: token, Accept: 'application/json' },
      body: form,
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    // The body is part of the request: a stall while reading it is a timeout, not a bad reply.
    if (timedOut) return fail('timeout', true);
    if (outside?.aborted) return fail('cancelled');
    if (!response.ok)
      return failureFrom(response.status, failureSchema.safeParse(body).data ?? null);

    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) return fail('invalid_response');
    const text = parsed.data.text.trim();
    if (text.length === 0) return fail('no_speech');
    return {
      ok: true,
      value: {
        text,
        polished: parsed.data.polished ?? false,
        languages: parsed.data.languages ?? [],
        seconds: parsed.data.seconds ?? null,
      },
    };
  } catch {
    if (timedOut) return fail('timeout', true);
    if (outside?.aborted) return fail('cancelled');
    return fail('offline', true);
  } finally {
    clearTimeout(timer);
    outside?.removeEventListener('abort', stop);
  }
}

/** Codes where trying again cannot help until something outside the app changes. */
export const UNAVAILABLE_CODES: readonly string[] = [
  'unauthorized',
  'not_configured',
  'unavailable',
];
