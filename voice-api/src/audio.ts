import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import type { Audio } from './pipeline.js';

const require = createRequire(import.meta.url);

/**
 * OpenAI rejects raw ADTS, but Android records it because a cut-off ADTS file stays playable. This
 * turns it into FLAC through pipes, and nothing touches the disk. FLAC is lossless, so the sound is
 * exactly what was recorded. MP4 cannot be written to a pipe except in fragments, and OpenAI refused
 * fragmented MP4 at lengths with no pattern: 1 s, 5.5 s and past 6.3 minutes. The phone sends about
 * five minutes at a time (src/services/transcription.ts), which keeps this well under OpenAI's 25 MB.
 */
export async function normalise(audio: Audio): Promise<Audio> {
  if (!audio.filename.toLowerCase().endsWith('.aac')) return audio;
  const bytes = await toFlac(audio.bytes);
  return { bytes, filename: audio.filename.replace(/\.aac$/i, '.flac'), type: 'audio/flac' };
}

function toFlac(input: Uint8Array): Promise<Uint8Array> {
  const binary: string = process.env.ECHO_FFMPEG ?? require('ffmpeg-static');
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(binary, [
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
    const chunks: Buffer[] = [];
    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.resume();
    ffmpeg.stdin.on('error', () => undefined);
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error('convert_failed'));
    });
    ffmpeg.stdin.end(input);
  });
}
