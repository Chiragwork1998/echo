import { z } from 'zod';

import { env } from '@/config/env';
import { openEntryAudio } from '@/features/journal/api';
import type { JournalResult, PlayableAudio } from '@/features/journal/types';
import { usePreferences, voiceStatus, type VoiceStatus } from '@/state/preferences';

import { parseWav, planPieces, wavPiece } from './wav';

// Turns a sealed recording into text through ECHO's voice server (docs/OWNER_DECISIONS.md, D-005,
// D-008). Nothing here throws, and nothing here logs: not the audio, not the words, not the
// address. An error is a code and whether trying again could help, in the same shape as the
// journal's.

export type TranscriptionErrorCode =
  /** The person has not agreed, or chose to keep their voice on the phone. Nothing was sent. */
  | 'consent_required'
  /** No address or token, an unsafe address, or the server says it has no key. */
  | 'not_configured'
  /** The server did not accept the token. */
  | 'unauthorized'
  /** The phone reports that it has no connection. Said only when that is true. */
  | 'offline'
  /** Something went wrong in sending that is not known to be the network. */
  | 'unexpected'
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
  /**
   * The words as the person said them (D-008), or tidied if they asked for that. If a second step
   * failed on the server, the plain transcript.
   */
  text: string;
  polished: boolean;
  languages: string[];
  seconds: number | null;
};

export type WordsStyle = 'exact' | 'tidy';

const fail = <T = never>(
  code: TranscriptionErrorCode,
  retryable = false,
): TranscriptionResult<T> => ({
  ok: false,
  error: { code, retryable },
});

/** About 100 seconds: the server allows 80 for transcription and 25 for the second step. */
export const TRANSCRIBE_TIMEOUT_MS = 100_000;
export const TRANSCRIBE_PATH = '/api/transcribe';
export const REFINE_PATH = '/api/refine';
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
/** A longer WAV, which is what a live take is, is sent in pieces of about this size. */
export const PIECE_BYTES = 4_000_000;

const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

/**
 * The server's address, or null when it must not be used. Anything but a phone talking to itself
 * has to be https: a voice never crosses a network in the clear. Parsed by hand, because the URL
 * class is not complete on every React Native runtime, and strict, so that a host like
 * "127.0.0.1.example.com" or "localhost@example.com" cannot pass for a local one.
 */
export function voiceEndpoint(
  raw: string | undefined,
  path: string = TRANSCRIBE_PATH,
): string | null {
  const match = /^(https?):\/\/([^/?#@\s]+)\/?$/i.exec((raw ?? '').trim());
  if (!match) return null;
  const scheme = match[1]!.toLowerCase();
  const authority = match[2]!.toLowerCase();
  const host = authority.replace(/:\d{1,5}$/, '');
  if (host.length === 0 || host.includes(':')) return null;
  if (scheme === 'http' && !LOCAL_HOSTS.includes(host)) return null;
  return `${scheme}://${authority}${path}`;
}

const responseSchema = z.object({
  text: z.string(),
  polished: z.boolean().optional(),
  languages: z.array(z.string()).optional(),
  seconds: z.number().nullable().optional(),
});
const refineSchema = z.object({ text: z.string() });
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
  /**
   * The recording as a form part. Expo's fetch reads a part through its bytes(), so this is an
   * expo-file-system File: the { uri, name, type } part of React Native's own FormData is refused.
   */
  filePart: (uri: string) => Blob;
  /** A range of a file, for cutting a long WAV into pieces. */
  readRange: (uri: string, offset: number, length: number) => Promise<Uint8Array>;
  /** Exact words unless the person turned on Tidy my words (D-008). */
  style: () => WordsStyle;
  /** Whether the phone reports a connection. null when that cannot be known. */
  online: () => Promise<boolean | null>;
};

type FileSystem = typeof import('expo-file-system');
// Loaded here so that a screen that merely imports this service works where the native module is
// missing, such as Jest and the web preview.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileSystem = (): FileSystem => require('expo-file-system') as FileSystem;

function sizeOnDisk(uri: string): number | null {
  try {
    const size = new (fileSystem().File)(uri).size;
    return typeof size === 'number' && size > 0 ? size : null;
  } catch {
    return null;
  }
}

async function rangeOnDisk(uri: string, offset: number, length: number): Promise<Uint8Array> {
  const { File, FileMode } = fileSystem();
  const handle = new File(uri).open(FileMode.ReadOnly);
  try {
    handle.offset = offset;
    return await handle.readBytes(length);
  } finally {
    handle.close();
  }
}

async function connected(): Promise<boolean | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const network = require('expo-network') as typeof import('expo-network');
    const state = await network.getNetworkStateAsync();
    return state.isConnected === false || state.isInternetReachable === false ? false : true;
  } catch {
    return null;
  }
}

const defaults = (): TranscribeDeps => ({
  fetch: (input, init) => fetch(input, init),
  url: env.EXPO_PUBLIC_VOICE_URL,
  token: env.EXPO_PUBLIC_VOICE_TOKEN,
  timeoutMs: TRANSCRIBE_TIMEOUT_MS,
  status: () => voiceStatus(usePreferences.getState().voiceConsent),
  sizeOf: sizeOnDisk,
  filePart: (uri) => new (fileSystem().File)(uri) as unknown as Blob,
  readRange: rangeOnDisk,
  style: () => (usePreferences.getState().tidyWords ? 'tidy' : 'exact'),
  online: connected,
});

/** Bytes in memory that Expo's fetch can send as a file: it reads a part through bytes(). */
export function bytesPart(bytes: Uint8Array, name: string, type: string): Blob {
  return { bytes: async () => bytes, name, type, size: bytes.length } as unknown as Blob;
}

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

type Part = { value: Blob; name: string };

async function upload(
  uri: string,
  endpoint: string,
  token: string,
  deps: TranscribeDeps,
  outside: AbortSignal | undefined,
): Promise<TranscriptionResult<Transcript>> {
  const extension = /\.([a-z0-9]+)$/i.exec(uri)?.[1]?.toLowerCase() ?? '';
  if (!TYPES[extension]) return fail('unsupported');
  const bytes = deps.sizeOf(uri);
  if (bytes !== null && bytes > MAX_UPLOAD_BYTES) {
    // Raw PCM can be cut anywhere. Anything else that is too long for the server stays put, and
    // the person is told now rather than after sending most of it.
    if (extension !== 'wav') return fail('too_long');
    return uploadPieces(uri, bytes, endpoint, token, deps, outside);
  }
  return post(endpoint, token, deps, outside, () => ({
    value: deps.filePart(uri),
    name: `speech.${extension}`,
  }));
}

/**
 * A WAV too long for one request: cut into pieces at the quietest moments, sent one at a time in the
 * order they were spoken, and joined. A piece with nothing said in it is not a failure.
 */
async function uploadPieces(
  uri: string,
  size: number,
  endpoint: string,
  token: string,
  deps: TranscribeDeps,
  outside: AbortSignal | undefined,
): Promise<TranscriptionResult<Transcript>> {
  let info: ReturnType<typeof parseWav>;
  let ranges: Awaited<ReturnType<typeof planPieces>>;
  try {
    info = parseWav(await deps.readRange(uri, 0, Math.min(size, 4096)), size);
    if (!info) return fail('unsupported');
    ranges = await planPieces(info, PIECE_BYTES, (offset, length) =>
      deps.readRange(uri, offset, length),
    );
  } catch {
    return fail('audio_unavailable', true);
  }

  const texts: string[] = [];
  const languages = new Set<string>();
  let seconds = 0;
  let polished = false;
  for (const range of ranges) {
    if (outside?.aborted) return fail('cancelled');
    let piece: Uint8Array;
    try {
      piece = wavPiece(info, await deps.readRange(uri, range.start, range.end - range.start));
    } catch {
      return fail('audio_unavailable', true);
    }
    const result = await post(endpoint, token, deps, outside, () => ({
      value: bytesPart(piece, 'speech.wav', 'audio/wav'),
      name: 'speech.wav',
    }));
    if (!result.ok) {
      if (result.error.code === 'no_speech') continue;
      return result;
    }
    texts.push(result.value.text);
    result.value.languages.forEach((code) => languages.add(code));
    seconds += result.value.seconds ?? 0;
    polished = polished || result.value.polished;
  }
  if (texts.length === 0) return fail('no_speech');
  return {
    ok: true,
    value: { text: texts.join(' '), polished, languages: [...languages], seconds },
  };
}

/** One request, with its own timeout, and a failure named for what it was. */
async function post(
  endpoint: string,
  token: string,
  deps: TranscribeDeps,
  outside: AbortSignal | undefined,
  part: () => Part,
): Promise<TranscriptionResult<Transcript>> {
  // A request that cannot be built has not met the network, and is not reported as the network.
  let form: FormData;
  try {
    form = new FormData();
    const { value, name } = part();
    form.append('file', value, name);
    form.append('style', deps.style());
  } catch {
    return fail('unexpected', true);
  }

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
    return await failedToSend(timedOut, outside, deps.online);
  } finally {
    clearTimeout(timer);
    outside?.removeEventListener('abort', stop);
  }
}

/**
 * Offline is said only when the phone itself reports it. Anything else that throws, such as a part
 * the request could not read, is unexpected, and the person is not told to check a connection that
 * is fine.
 */
async function failedToSend(
  timedOut: boolean,
  outside: AbortSignal | undefined,
  online: TranscribeDeps['online'],
): Promise<TranscriptionResult<never>> {
  if (timedOut) return fail('timeout', true);
  if (outside?.aborted) return fail('cancelled');
  return (await online().catch(() => null)) === false
    ? fail('offline', true)
    : fail('unexpected', true);
}

/** Whether words heard live still need the server: Tidy was asked for, or there is Hindi in them. */
export const hasDevanagari = (text: string) => /[ऀ-ॿ]/.test(text);

export type RefineDeps = Pick<
  TranscribeDeps,
  'fetch' | 'url' | 'token' | 'timeoutMs' | 'status' | 'style' | 'online'
>;

/**
 * The same rules as a recording gets, for words that were heard live (D-008): exact words are kept
 * as they are, with no request at all unless there is Devanagari to write in Roman script, and tidy
 * words are polished. Consent is checked here too.
 */
export async function refineWords(
  text: string,
  options: { signal?: AbortSignal } = {},
  overrides: Partial<RefineDeps> = {},
): Promise<TranscriptionResult<{ text: string }>> {
  const deps = { ...defaults(), ...overrides };
  if (deps.status() !== 'allowed') return fail('consent_required');
  const spoken = text.trim();
  if (spoken.length === 0) return fail('no_speech');
  const style = deps.style();
  if (style === 'exact' && !hasDevanagari(spoken)) return { ok: true, value: { text: spoken } };

  const endpoint = voiceEndpoint(deps.url, REFINE_PATH);
  if (!endpoint || !deps.token) return fail('not_configured');
  if (options.signal?.aborted) return fail('cancelled');

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deps.timeoutMs);
  const stop = () => controller.abort();
  options.signal?.addEventListener('abort', stop);
  try {
    const response = await deps.fetch(endpoint, {
      method: 'POST',
      headers: {
        [TOKEN_HEADER]: deps.token,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: spoken, style }),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (timedOut) return fail('timeout', true);
    if (options.signal?.aborted) return fail('cancelled');
    if (!response.ok)
      return failureFrom(response.status, failureSchema.safeParse(body).data ?? null);
    const parsed = refineSchema.safeParse(body);
    if (!parsed.success || parsed.data.text.trim().length === 0) return fail('invalid_response');
    return { ok: true, value: { text: parsed.data.text.trim() } };
  } catch {
    return await failedToSend(timedOut, options.signal, deps.online);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', stop);
  }
}

/** Codes where trying again cannot help until something outside the app changes. */
export const UNAVAILABLE_CODES: readonly string[] = [
  'unauthorized',
  'not_configured',
  'unavailable',
];
