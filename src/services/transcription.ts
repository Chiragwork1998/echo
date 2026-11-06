import { z } from 'zod';

import { env } from '@/config/env';
import { openEntryAudio } from '@/features/journal/api';
import type { JournalResult, PlayableAudio } from '@/features/journal/types';
import { usePreferences, voiceStatus, type VoiceStatus } from '@/state/preferences';

import { planAdtsPieces } from './adts';
import { joinSpokenPieces } from './joinWords';
import { voiceOrigin } from './voiceApi';
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

/** What one request may carry (voice-api/api/transcribe.ts): Vercel refuses a body of more than 4.5 MB. */
export const MAX_UPLOAD_BYTES = 4_400_000;
/** A longer recording is sent in pieces of at most this many bytes: a WAV, which is what a live take is, or an ADTS .aac. */
export const PIECE_BYTES = 4_000_000;
/**
 * And of at most this much sound. The server makes an .aac into FLAC, about 46 KB a second, and OpenAI
 * takes 25 MB, so a piece is well within that. Five minutes also keeps each piece quick.
 */
export const PIECE_SECONDS = 300;
/** An .aac cannot be listened to for a quiet moment, so each piece begins this long before the last one ended. */
export const PIECE_OVERLAP_SECONDS = 5;
/**
 * The same .aac path refuses a clip of under about five and a half seconds, and the end of a take cut in
 * pieces can be little more than the overlap. An end shorter than this is sent with the piece before it.
 */
export const PIECE_MIN_SECONDS = 20;
/** An .aac smaller than this, about 200 seconds at 40 kbps, is one piece without being looked through. */
const AAC_WHOLE_BELOW_BYTES = 1_000_000;
/** How many pieces of one take are on their way at once. */
export const PIECE_CONCURRENCY = 3;
/**
 * What a phone's uplink is assumed to manage at its worst, in bytes a second. Pieces share it, so each
 * is given the time to be sent at this speed, on top of the time the server takes.
 */
const SLOW_UPLINK = 100_000;

/** How long a piece may take: the server's time, and the time to send it with `sharing` pieces at once. */
export const pieceTimeoutMs = (baseMs: number, bytes: number, sharing: number) =>
  baseMs + Math.ceil((bytes * sharing * 1000) / SLOW_UPLINK);

/**
 * The server's address for a route, or null when it must not be used. The rule is the app's one rule
 * for ECHO's server (`voiceOrigin`): https, with plain http only for this Mac's own address in a
 * development build.
 */
export function voiceEndpoint(
  raw: string | undefined,
  path: string = TRANSCRIBE_PATH,
  development?: boolean,
): string | null {
  const origin = voiceOrigin(raw, development);
  return origin && `${origin}${path}`;
}

const responseSchema = z.object({
  text: z.string(),
  /** The words before their script was changed. Used to find the overlap between pieces, and nowhere else. */
  raw: z.string().optional(),
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
  /** A range of a file, for cutting a long recording into pieces. */
  readRange: (uri: string, offset: number, length: number) => Promise<Uint8Array>;
  /** The most bytes, and the most sound, in one piece of a long recording. */
  pieceBytes: number;
  pieceSeconds: number;
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
  pieceBytes: PIECE_BYTES,
  pieceSeconds: PIECE_SECONDS,
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

/** What one request brought back. `raw` is only ever used to join pieces. */
type Sent = Transcript & { raw: string | null };
const plain = ({ raw: _raw, ...transcript }: Sent): Transcript => transcript;

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
  const whole = async (): Promise<TranscriptionResult<Transcript>> => {
    const sent = await post(endpoint, token, deps, outside, () => ({
      value: deps.filePart(uri),
      name: `speech.${extension}`,
    }));
    return sent.ok ? { ok: true, value: plain(sent.value) } : sent;
  };
  // PCM can be cut anywhere, and ADTS between any two frames. Anything else that is too long for the
  // server (an .m4a, which iOS records) cannot be cut without decoding it, stays put, and the person
  // is told now rather than after sending most of it.
  if (bytes !== null) {
    if (extension === 'aac' && bytes > AAC_WHOLE_BELOW_BYTES) {
      return uploadAac(uri, bytes, endpoint, token, deps, outside, whole);
    }
    if (bytes > MAX_UPLOAD_BYTES) {
      if (extension === 'wav') return uploadWavInPieces(uri, bytes, endpoint, token, deps, outside);
      return fail('too_long');
    }
  }
  return whole();
}

/** A recording cut into pieces: how many, and how to get the bytes of each. */
type PiecePlan = {
  count: number;
  /** The bytes of one piece. Rejects if the recording cannot be read. */
  read: (index: number) => Promise<Uint8Array>;
  name: string;
  type: string;
  /**
   * How much sound neighbouring pieces both hold, or 0 when they do not overlap. An overlap is looked
   * for in the words, and its duration is taken off the total.
   */
  overlapSeconds: number;
};

/**
 * A WAV too long for one request: cut into pieces at the quietest moments, so that no word is split
 * and the pieces need no overlap.
 */
async function uploadWavInPieces(
  uri: string,
  size: number,
  endpoint: string,
  token: string,
  deps: TranscribeDeps,
  outside: AbortSignal | undefined,
): Promise<TranscriptionResult<Transcript>> {
  let info: NonNullable<ReturnType<typeof parseWav>>;
  let ranges: Awaited<ReturnType<typeof planPieces>>;
  try {
    const parsed = parseWav(await deps.readRange(uri, 0, Math.min(size, 4096)), size);
    if (!parsed) return fail('unsupported');
    info = parsed;
    ranges = await planPieces(info, deps.pieceBytes, (offset, length) =>
      deps.readRange(uri, offset, length),
    );
  } catch {
    return fail('audio_unavailable', true);
  }
  return sendPieces(
    {
      count: ranges.length,
      read: async (index) => {
        const { start, end } = ranges[index]!;
        return wavPiece(info, await deps.readRange(uri, start, end - start));
      },
      name: 'speech.wav',
      type: 'audio/wav',
      overlapSeconds: 0,
    },
    endpoint,
    token,
    deps,
    outside,
  );
}

/**
 * An ADTS .aac, which is what Android records. A long take is cut between frames into pieces of five
 * minutes, which keeps each one quick and within OpenAI's size limit once the server has made it FLAC.
 * They overlap by a few seconds because the quiet moments cannot be found without decoding it. The words of the overlap are said twice and
 * joined once (joinWords.ts). A take that fits is sent whole. A file that cannot be followed frame by
 * frame is sent whole if the server could take it, and is otherwise too long.
 */
async function uploadAac(
  uri: string,
  size: number,
  endpoint: string,
  token: string,
  deps: TranscribeDeps,
  outside: AbortSignal | undefined,
  whole: () => Promise<TranscriptionResult<Transcript>>,
): Promise<TranscriptionResult<Transcript>> {
  let plan: Awaited<ReturnType<typeof planAdtsPieces>>;
  try {
    plan = await planAdtsPieces(
      size,
      {
        seconds: deps.pieceSeconds,
        bytes: deps.pieceBytes,
        overlapSeconds: PIECE_OVERLAP_SECONDS,
        minSeconds: PIECE_MIN_SECONDS,
      },
      (offset, length) => deps.readRange(uri, offset, length),
    );
  } catch {
    return fail('audio_unavailable', true);
  }
  if (!plan) return size > MAX_UPLOAD_BYTES ? fail('too_long') : whole();
  const { ranges, overlapSeconds } = plan;
  if (ranges.length === 1) return whole();
  return sendPieces(
    {
      count: ranges.length,
      read: (index) => {
        const { start, end } = ranges[index]!;
        return deps.readRange(uri, start, end - start);
      },
      name: 'speech.aac',
      type: 'audio/aac',
      overlapSeconds,
    },
    endpoint,
    token,
    deps,
    outside,
  );
}

/**
 * The server writes Hindi in Roman script one request at a time, and keeps the Devanagari when its
 * check of the result fails. With a take in pieces that leaves a whole piece in a script the app
 * cannot show, between pieces that are not, so such a piece gets one more try with the same step on
 * its words alone. It never fails the take: if the try does not work, the piece stays as it was.
 */
async function romaniseAgain(
  piece: Sent,
  style: WordsStyle,
  deps: TranscribeDeps,
  signal: AbortSignal,
): Promise<Sent> {
  if (style !== 'exact' || !hasDevanagari(piece.text)) return piece;
  const again = await refineWords(piece.text, { signal }, { ...deps, style: () => style });
  return again.ok && !hasDevanagari(again.value.text)
    ? { ...piece, text: again.value.text }
    : piece;
}

/**
 * The pieces of one take, a few at a time and joined in the order they were spoken. A piece with
 * nothing said in it is not a failure, once it has been asked for twice. A piece that fails is the whole take failing: the first
 * failure stops the others, none of the words are returned, and trying again sends the take afresh.
 * Part of a take is never handed back as if it were the whole. What is decided for the take is
 * decided once, before the first piece: the style of the words.
 */
async function sendPieces(
  plan: PiecePlan,
  endpoint: string,
  token: string,
  deps: TranscribeDeps,
  outside: AbortSignal | undefined,
): Promise<TranscriptionResult<Transcript>> {
  const style = deps.style();
  const arrived: (Sent | null | undefined)[] = new Array<undefined>(plan.count).fill(undefined);
  const stop = new AbortController();
  const stopOnRequest = () => stop.abort();
  outside?.addEventListener('abort', stopOnRequest);
  if (outside?.aborted) stop.abort();

  let failure: TranscriptionResult<never> | null = null;
  const giveUp = (result: TranscriptionResult<never>) => {
    failure ??= result;
    stop.abort();
  };
  let next = 0;
  const worker = async () => {
    while (next < plan.count && !stop.signal.aborted) {
      const index = next;
      next += 1;
      let bytes: Uint8Array;
      try {
        bytes = await plan.read(index);
      } catch {
        giveUp(fail('audio_unavailable', true));
        return;
      }
      if (stop.signal.aborted) return;
      // Pieces share the phone's uplink, so each is given the time that sending it would take.
      const timeoutMs = pieceTimeoutMs(
        deps.timeoutMs,
        bytes.length,
        Math.min(PIECE_CONCURRENCY, plan.count),
      );
      const ask = () =>
        post(
          endpoint,
          token,
          { ...deps, timeoutMs },
          stop.signal,
          () => ({ value: bytesPart(bytes, plan.name, plan.type), name: plan.name }),
          style,
        );
      let result = await ask();
      // A long take may honestly hold a quiet stretch, so an empty piece is not a failure. But an
      // empty answer is also what a piece looks like when the recogniser missed it, and its words
      // would be gone without a trace. It is asked for once more, and only a second empty answer
      // means silence.
      if (!result.ok && result.error.code === 'no_speech' && !stop.signal.aborted) {
        result = await ask();
      }
      if (result.ok) {
        arrived[index] = await romaniseAgain(result.value, style, deps, stop.signal);
      } else if (result.error.code === 'no_speech') {
        arrived[index] = null;
      } else {
        giveUp(result);
        return;
      }
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(PIECE_CONCURRENCY, plan.count) }, () => worker()),
    );
  } finally {
    outside?.removeEventListener('abort', stopOnRequest);
  }
  if (outside?.aborted) return fail('cancelled');
  if (failure) return failure;

  const spoken = arrived.filter((piece): piece is Sent => piece !== null && piece !== undefined);
  if (spoken.length === 0) return fail('no_speech');
  const text =
    plan.overlapSeconds > 0
      ? joinSpokenPieces(
          // Only words that were not tidied line up with the transcript they came from.
          spoken.map((piece) => ({
            text: piece.text,
            heard: piece.polished || piece.raw === null ? undefined : piece.raw,
          })),
        )
      : spoken.map((piece) => piece.text).join(' ');
  const seconds = spoken.every((piece) => piece.seconds !== null)
    ? Math.max(
        0,
        spoken.reduce((total, piece) => total + piece.seconds!, 0) -
          plan.overlapSeconds * (spoken.length - 1),
      )
    : null;
  return {
    ok: true,
    value: {
      text,
      // Tidy only if every piece was.
      polished: spoken.every((piece) => piece.polished),
      languages: [...new Set(spoken.flatMap((piece) => piece.languages))],
      seconds,
    },
  };
}

/** One request, with its own timeout, and a failure named for what it was. */
async function post(
  endpoint: string,
  token: string,
  deps: TranscribeDeps,
  outside: AbortSignal | undefined,
  part: () => Part,
  style: WordsStyle = deps.style(),
): Promise<TranscriptionResult<Sent>> {
  // A request that cannot be built has not met the network, and is not reported as the network.
  let form: FormData;
  try {
    form = new FormData();
    const { value, name } = part();
    form.append('file', value, name);
    form.append('style', style);
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
        raw: parsed.data.raw?.trim() ?? null,
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
