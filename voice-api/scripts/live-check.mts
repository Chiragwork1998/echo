// Streams a PCM file (24 kHz, mono, 16-bit little-endian) through a running voice API to OpenAI's live
// transcription, using the app's own code for the connection, the turns and the ordering, and prints
// how long the words took and what they looked like. It is for checking the live path by hand:
//
//   PORT=8798 ECHO_KEY_FILE=... ECHO_TOKEN_FILE=... npm run dev
//   ECHO_TOKEN_FILE=... npx tsx scripts/live-check.mts take.pcm [http://127.0.0.1:8798]
//
// Make a take with: say -o take.aiff "..." && ffmpeg -i take.aiff -ac 1 -ar 24000 -f s16le take.pcm
// The words it prints are whatever was in the file you gave it. It sends nothing but that file.
import { readFileSync } from 'node:fs';

import { LIVE_RATE } from '../../src/services/liveAudio.ts';
import { createLiveTake } from '../../src/services/liveTake.ts';
import { openLiveSocket } from '../../src/services/liveTranscription.ts';

const [file, base = 'http://127.0.0.1:8798'] = process.argv.slice(2);
if (!file || !process.env.ECHO_TOKEN_FILE) throw new Error('usage: live-check.mts take.pcm [base]');
const token = readFileSync(process.env.ECHO_TOKEN_FILE, 'utf8').trim();
const bytes = readFileSync(file);
const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));

const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(2).padStart(6);
const log: string[] = [];

// The first loud tenth of a second is when the words begin.
const frame = LIVE_RATE / 10;
let onset = 0;
for (let i = 0; i + frame <= pcm.length; i += frame) {
  let sum = 0;
  for (let j = i; j < i + frame; j += 1) sum += pcm[j]! * pcm[j]!;
  if (Math.sqrt(sum / frame) > 600) {
    onset = i / LIVE_RATE;
    break;
  }
}

let firstWords: number | null = null;
let shown = '';
const take = createLiveTake(
  {
    open: (handlers) =>
      openLiveSocket(
        {
          onEvent: (event) => {
            if (event.kind === 'delta' && firstWords === null) firstWords = (Date.now() - t0) / 1000;
            log.push(`${at()}s ${event.kind}${'text' in event ? ` ${JSON.stringify(event.text)}` : ''} ${'itemId' in event ? event.itemId.slice(-5) : ''}`);
            handlers.onEvent(event);
          },
          onClose: () => {
            log.push(`${at()}s CLOSED`);
            handlers.onClose();
          },
        },
        // The person running this has agreed: it streams only the test file they gave it.
        { api: { url: base, token }, allowed: () => true },
      ),
  },
  () => {
    const now = take.text();
    if (now !== shown) shown = now;
  },
);

// Fed in real time, in 100 ms pieces, as a microphone would.
const CHUNK = LIVE_RATE / 10;
for (let at0 = 0; at0 < pcm.length; at0 += CHUNK) {
  take.push(pcm.slice(at0, at0 + CHUNK));
  await new Promise((resolve) => setTimeout(resolve, 100));
}
const ended = Date.now();
take.push(null);
const outcome = await take.outcome;
const finished = (Date.now() - ended) / 1000;

console.log(log.join('\n'));
console.log('---');
console.log(`speech begins at ${onset.toFixed(1)}s of audio; first words arrived ${firstWords === null ? 'never' : (firstWords - 0.0 - onset).toFixed(2) + 's after that'}`);
console.log(`after capture ended, the finished words took ${finished.toFixed(2)}s`);
console.log(outcome.ok ? `TEXT: ${outcome.text}` : 'FAILED: the take fell back');
