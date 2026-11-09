// Runs the voice API on this Mac for development, so no deployment is needed to build against it.
// ECHO_KEY_FILE and ECHO_TOKEN_FILE point at private files outside the repo. ECHO_INSTALL_SECRET_FILE
// may too; without it, install tokens are signed with a secret made for this run, and the phone simply
// asks for a new one after a restart. Counts are kept in memory unless Upstash is configured.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

process.env.OPENAI_API_KEY = readFileSync(process.env.ECHO_KEY_FILE ?? '', 'utf8').trim();
process.env.ECHO_VOICE_TOKEN = readFileSync(process.env.ECHO_TOKEN_FILE ?? '', 'utf8').trim();
process.env.ECHO_INSTALL_SECRET = process.env.ECHO_INSTALL_SECRET_FILE
  ? readFileSync(process.env.ECHO_INSTALL_SECRET_FILE, 'utf8').trim()
  : randomBytes(32).toString('base64url');
process.env.ECHO_FFMPEG ??= 'ffmpeg';
const routes = {
  'POST /api/transcribe': (await import('./api/transcribe.ts')).POST,
  'POST /api/patterns': (await import('./api/patterns.js')).POST,
  'POST /api/refine': (await import('./api/refine.js')).POST,
  'POST /api/format': (await import('./api/format.js')).POST,
  'POST /api/reflect': (await import('./api/reflect.js')).POST,
  'POST /api/live-session': (await import('./api/live-session.js')).POST,
  'POST /api/install': (await import('./api/install.js')).POST,
  'POST /api/report': (await import('./api/report.js')).POST,
  'GET /api/allowance': (await import('./api/allowance.js')).GET,
} as const;

const PORT = Number(process.env.PORT ?? 8787);
createServer(async (req, res) => {
  const handler = routes[`${req.method} ${req.url}` as keyof typeof routes];
  if (!handler) {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  // A copy of exactly the bytes received. A small Buffer is a view into a shared pool, and a body
  // must never carry more than its own bytes.
  const body = req.method === 'GET' ? undefined : new Uint8Array(Buffer.concat(chunks));
  const response = await handler(
    new Request(`http://localhost${req.url}`, { method: req.method, headers, body }),
  );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(PORT, '127.0.0.1', () => console.log(`voice api on 127.0.0.1:${PORT}`));
