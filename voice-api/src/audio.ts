import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import { VoiceError, type Audio } from './pipeline.js';

const require = createRequire(import.meta.url);

/**
 * What ffmpeg is held to. It takes whatever a phone sends it, and a request that runs it ends only
 * when it does, so each of these is a way for one request to cost the instance more than it should.
 * A five minute piece converts in about a second, so none is near what a real recording needs.
 */
export type Limits = {
  /** How long one conversion may run before it is killed. */
  timeoutMs: number;
  /** How many may run at once on this instance. A request that finds them all taken is told to try again. */
  maxRunning: number;
  /** The most it may write. OpenAI refuses a file of more than 25 MB, so nothing larger is of use. */
  maxOutputBytes: number;
};
export const LIMITS: Limits = {
  timeoutMs: 30_000,
  maxRunning: 4,
  maxOutputBytes: 25 * 1024 * 1024,
};

/** Conversions running now, on this instance. Every path that takes a place gives it back. */
let running = 0;

/**
 * OpenAI rejects raw ADTS, but Android records it because a cut-off ADTS file stays playable. This
 * turns it into FLAC through pipes, and nothing touches the disk. FLAC is lossless, so the sound is
 * exactly what was recorded. MP4 cannot be written to a pipe except in fragments, and OpenAI refused
 * fragmented MP4 at lengths with no pattern: 1 s, 5.5 s and past 6.3 minutes. The phone sends about
 * five minutes at a time (src/services/transcription.ts), which keeps this well under OpenAI's 25 MB.
 */
export async function normalise(audio: Audio, limits: Partial<Limits> = {}): Promise<Audio> {
  if (!audio.filename.toLowerCase().endsWith('.aac')) return audio;
  const bytes = await toFlac(audio.bytes, { ...LIMITS, ...limits });
  return { bytes, filename: audio.filename.replace(/\.aac$/i, '.flac'), type: 'audio/flac' };
}

function toFlac(input: Uint8Array, limits: Limits): Promise<Uint8Array> {
  if (running >= limits.maxRunning) return Promise.reject(new VoiceError('busy', true));
  running += 1;

  const binary: string = process.env.ECHO_FFMPEG ?? require('ffmpeg-static');
  return new Promise((resolve, reject) => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Settles once, gives the place back, and makes sure the process is gone, whichever way it ended.
    const end = (settle: () => void) => {
      if (finished) return;
      finished = true;
      running -= 1;
      clearTimeout(timer);
      ffmpeg?.kill('SIGKILL');
      settle();
    };

    let ffmpeg: ReturnType<typeof spawn> | undefined;
    try {
      ffmpeg = spawn(binary, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'aac',
        '-i',
        'pipe:0',
        '-vn',
        // OpenAI refuses sound shorter than about a second, and a tap and a quick second tap make one.
        // Quiet added at the end turns that into an honest answer: no words were heard.
        '-af',
        'apad=whole_dur=2',
        '-c:a',
        'flac',
        '-f',
        'flac',
        'pipe:1',
      ]);
    } catch (error) {
      return end(() => reject(error));
    }
    timer = setTimeout(() => end(() => reject(new VoiceError('too_slow', true))), limits.timeoutMs);

    const chunks: Buffer[] = [];
    let written = 0;
    ffmpeg.stdout!.on('data', (chunk: Buffer) => {
      written += chunk.length;
      if (written > limits.maxOutputBytes) {
        end(() => reject(new VoiceError('unsupported_audio', false)));
        return;
      }
      chunks.push(chunk);
    });
    ffmpeg.stderr!.resume();
    ffmpeg.stdin!.on('error', () => undefined);
    ffmpeg.on('error', (error) => end(() => reject(error)));
    ffmpeg.on('close', (code) =>
      end(() =>
        code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('convert_failed')),
      ),
    );
    ffmpeg.stdin!.end(input);
  });
}
