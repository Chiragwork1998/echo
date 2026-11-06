import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  finish,
  hasDevanagari,
  HINDI_SCRIPT,
  plausible,
  polish,
  ROMANISE_INSTRUCTIONS,
  run,
  sameWords,
  styleOf,
  transcribe,
  VoiceError,
  type Config,
} from './pipeline.js';

const audio = { bytes: new Uint8Array([1, 2, 3]), filename: 'a.m4a', type: 'audio/mp4' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
type Call = { url: string; init?: RequestInit };
/** A config whose every request is recorded, so a test can say which models were reached. */
const spy = (handler: (url: string, init?: RequestInit) => Response) => {
  const calls: Call[] = [];
  const config: Config = {
    apiKey: 'test',
    transcribeModel: 'gpt-transcribe',
    polishModel: 'polish',
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return handler(String(url), init);
    }) as typeof fetch,
  };
  return { config, calls, chat: () => calls.filter(({ url }) => url.endsWith('/responses')) };
};
const config = (handler: (url: string, init?: RequestInit) => Response): Config =>
  spy(handler).config;
const heard = (text: string, languages = 'en') =>
  reply(200, { text, languages: [{ code: languages }], usage: { seconds: 9 } });
const said = reply.bind(null, 200, { text: 'um so I feel heavy', languages: [{ code: 'en' }], usage: { seconds: 9 } });
const cleaned = (text: string) => reply(200, { output: [{ type: 'message', content: [{ text }] }] });

const CORRECTED =
  'I realised how much I miss him. Actually no, how much I needed him. Um, you know, I think I will sleep.';
const HINGLISH = 'आज मेरा मन बहुत भारी है यार, I think I need rest।';
const ROMAN = 'aaj mera mann bahut bhaari hai yaar, I think I need rest.';

test('exact words are the default, and anything unknown is exact too', () => {
  assert.equal(styleOf(undefined), 'exact');
  assert.equal(styleOf(null), 'exact');
  assert.equal(styleOf('polish'), 'exact');
  assert.equal(styleOf('tidy'), 'tidy');
});

test('exact never reaches the chat model, and keeps every filler and correction', async () => {
  const { config: c, calls, chat } = spy((url) => (url.endsWith('/responses') ? cleaned('SHOULD NOT BE USED') : heard(CORRECTED)));
  const result = await run(audio, c);
  assert.equal(result.style, 'exact');
  assert.equal(result.text, CORRECTED);
  assert.equal(result.raw, CORRECTED);
  assert.equal(result.polished, false);
  assert.equal(result.romanised, false);
  assert.equal(chat().length, 0);
  assert.equal(calls.length, 1);
});

test('tidy is the polish, and returns the polished text with the raw transcript beside it', async () => {
  const result = await run(audio, config((url) => (url.endsWith('/responses') ? cleaned('So I feel heavy.') : said())), 'tidy');
  assert.deepEqual(result, {
    text: 'So I feel heavy.',
    raw: 'um so I feel heavy',
    polished: true,
    romanised: false,
    style: 'tidy',
    languages: ['en'],
    seconds: 9,
  });
});

test('never loses words: a failed tidy falls back to the raw transcript', async () => {
  const result = await run(audio, config((url) => (url.endsWith('/responses') ? reply(500, {}) : said())), 'tidy');
  assert.equal(result.text, 'um so I feel heavy');
  assert.equal(result.polished, false);
});

test('rejects a tidy that lost most of what was said', async () => {
  const raw = 'I said a great many things today that matter a lot to me and they are all still true';
  assert.equal(await polish(raw, config(() => cleaned('Things matter.'))), null);
  assert.equal(plausible('', 'anything'), false);
});

test('asks OpenAI not to store the cleanup, and marks the transcript as data', async () => {
  let sent: { store?: boolean; input?: string } = {};
  await polish('hello there', config((_url, init) => {
    sent = JSON.parse(String(init?.body));
    return cleaned('Hello there.');
  }));
  assert.equal(sent.store, false);
  assert.ok(sent.input?.startsWith('<transcript>'));
});

test('an upstream outage is retryable, and bad audio is not', async () => {
  await assert.rejects(transcribe(audio, config(() => reply(503, {}))), (e: VoiceError) => e.code === 'upstream' && e.retryable);
  await assert.rejects(transcribe(audio, config(() => reply(400, {}))), (e: VoiceError) => e.code === 'unsupported_audio' && !e.retryable);
});

test('silence is reported, not saved as an empty entry', async () => {
  await assert.rejects(run(audio, config(() => reply(200, { text: '  ' }))), (e: VoiceError) => e.code === 'empty');
});

test('exact Hindi gets one script-only step that is told to change nothing else', async () => {
  assert.equal(HINDI_SCRIPT, 'roman');
  const { config: c, chat } = spy((url) => (url.endsWith('/responses') ? cleaned(ROMAN) : heard(HINGLISH, 'hi')));
  const result = await run(audio, c);
  assert.equal(result.text, ROMAN);
  assert.equal(result.raw, HINGLISH);
  assert.equal(result.romanised, true);
  assert.equal(result.polished, false);
  assert.equal(chat().length, 1);
  const sent = JSON.parse(String(chat()[0]?.init?.body)) as { instructions: string; input: string; store: boolean };
  assert.equal(sent.instructions, ROMANISE_INSTRUCTIONS);
  assert.match(sent.instructions, /Do not remove, add, merge, split, reorder, correct, or rephrase/);
  assert.equal(sent.store, false);
  assert.equal(sent.input, `<transcript>\n${HINGLISH}\n</transcript>`);
});

test('the word-count guard: a script step that drops, adds, or rewrites a word is thrown away', async () => {
  const wrong: [string, string][] = [
    ['dropped a word', 'aaj mera mann bhaari hai yaar, I think I need rest.'],
    ['added a word', 'aaj mera mann bahut bhaari hai yaar, I think I really need rest.'],
    ['changed an English word', 'aaj mera mann bahut bhaari hai yaar, I believe I need rest.'],
    ['moved an English word', 'aaj mera mann bahut bhaari hai I yaar, think I need rest.'],
    ['left Devanagari behind', 'aaj मेरा mann bahut bhaari hai yaar, I think I need rest.'],
    ['summarised', 'I feel heavy.'],
  ];
  for (const [what, answer] of wrong) {
    const { config: c } = spy((url) => (url.endsWith('/responses') ? cleaned(answer) : heard(HINGLISH, 'hi')));
    const result = await run(audio, c);
    assert.equal(result.text, HINGLISH, what);
    assert.equal(result.romanised, false, what);
  }
});

test('a script step that fails outright leaves the transcript untouched', async () => {
  const result = await run(audio, config((url) => (url.endsWith('/responses') ? reply(500, {}) : heard(HINGLISH, 'hi'))));
  assert.equal(result.text, HINGLISH);
  assert.equal(result.romanised, false);
});

test('sameWords allows only a change of script', () => {
  assert.ok(sameWords('मुझे नहीं पता', 'mujhe nahi pata'));
  assert.ok(sameWords('हाँ। I know, um, I know', 'haan. I know, um, I know'));
  assert.ok(sameWords('Um, I felt it', 'um I felt it'), 'case and punctuation of an English word are not the words');
  assert.ok(!sameWords('मुझे नहीं पता', 'mujhe pata'));
  assert.ok(!sameWords('मुझे नहीं पता', 'mujhe nahi pata hai'));
  assert.ok(!sameWords('मुझे नहीं पता', 'मुझे nahi pata'));
  assert.ok(!sameWords('I know नहीं', 'I knew nahi'));
  assert.ok(!sameWords('', ''));
  assert.ok(hasDevanagari('यार') && !hasDevanagari('yaar'));
});

test('finish: exact text with no Devanagari is returned as it is, tidy always polishes', async () => {
  const { config: c, chat } = spy(() => cleaned('Hello there.'));
  assert.deepEqual(await finish('hello um there', 'exact', c), { text: 'hello um there', polished: false, romanised: false });
  assert.equal(chat().length, 0);
  assert.deepEqual(await finish('hello um there', 'tidy', c), { text: 'Hello there.', polished: true, romanised: false });
});
