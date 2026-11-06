import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import type { Audio } from './pipeline.ts';

const require = createRequire(import.meta.url);

/**
 * OpenAI rejects raw ADTS, but Android records it because a cut-off ADTS file stays playable. This
 * rewraps the same AAC frames as MP4 through pipes: no re-encoding, and nothing touches the disk.
 */
export async function normalise(audio: Audio): Promise<Audio> {
  if (!audio.filename.toLowerCase().endsWith('.aac')) return audio;
  const bytes = await rewrap(audio.bytes);
  return { bytes, filename: audio.filename.replace(/\.aac$/i, '.m4a'), type: 'audio/mp4' };
}

function rewrap(input: Uint8Array): Promise<Uint8Array> {
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
      '-c',
      'copy',
      '-bsf:a',
      'aac_adtstoasc',
      '-f',
      'mp4',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.resume();
    ffmpeg.stdin.on('error', () => undefined);
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error('rewrap_failed'));
    });
    ffmpeg.stdin.end(input);
  });
}
