// Calls a running voice API the way the app does, for checking exact and tidy words by hand:
//
//   ECHO_TOKEN_FILE=... npx tsx scripts/routes-check.mts transcribe take.m4a exact|tidy [base]
//   ECHO_TOKEN_FILE=... npx tsx scripts/routes-check.mts refine "text to refine" exact|tidy [base]
//
// It prints the answer, so only use it with test audio and made-up text.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [route, input, style = 'exact', base = 'http://127.0.0.1:8798'] = process.argv.slice(2);
if (!route || !input || !process.env.ECHO_TOKEN_FILE) throw new Error('see the header of this file');
const headers = { 'x-echo-voice-token': readFileSync(process.env.ECHO_TOKEN_FILE, 'utf8').trim() };

const started = Date.now();
let response: Response;
if (route === 'transcribe') {
  const form = new FormData();
  form.append('file', new File([readFileSync(input)], basename(input), { type: 'audio/mp4' }));
  form.append('style', style);
  response = await fetch(`${base}/api/transcribe`, { method: 'POST', headers, body: form });
} else {
  response = await fetch(`${base}/api/refine`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ text: input, style }),
  });
}
console.log(response.status, `${Date.now() - started}ms`);
console.log(JSON.stringify(await response.json(), null, 1));
