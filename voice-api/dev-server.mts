// Runs the voice API on this Mac for development, so no deployment is needed to build against it.
// ECHO_KEY_FILE and ECHO_TOKEN_FILE point at private files outside the repo.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

process.env.OPENAI_API_KEY = readFileSync(process.env.ECHO_KEY_FILE ?? '', 'utf8').trim();
process.env.ECHO_VOICE_TOKEN = readFileSync(process.env.ECHO_TOKEN_FILE ?? '', 'utf8').trim();
process.env.ECHO_FFMPEG ??= 'ffmpeg';
const routes = {
  '/api/transcribe': (await import('./api/transcribe.ts')).POST,
  '/api/patterns': (await import('./api/patterns.js')).POST,
  '/api/refine': (await import('./api/refine.js')).POST,
  '/api/live-session': (await import('./api/live-session.js')).POST,
} as const;

const PORT = Number(process.env.PORT ?? 8787);
createServer(async (req, res) => {
  const POST = req.method === 'POST' ? routes[req.url as keyof typeof routes] : undefined;
  if (!POST) {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  const response = await POST(
    new Request(`http://localhost${req.url}`, {
      method: 'POST',
      headers,
      body: Buffer.concat(chunks),
    }),
  );
  res.writeHead(response.status, { 'content-type': 'application/json' });
  res.end(await response.text());
}).listen(PORT, '127.0.0.1', () => console.log(`voice api on 127.0.0.1:${PORT}`));
