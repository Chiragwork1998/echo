import { LIVE_RATE } from './liveAudio';
import { createLiveTake, FINISH_MS } from './liveTake';
import type { LiveEvent, LiveHandlers, LiveSocket } from './liveTranscription';

const sound = (seconds: number, loud: boolean) => {
  const samples = new Int16Array(Math.round(seconds * LIVE_RATE));
  if (loud)
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.round(6000 * Math.sin(i / 5));
  return samples;
};

/** A connection the test controls: it records what is sent and lets the test say what comes back. */
function connection({ opens = true, delay = false } = {}) {
  const sent: string[] = [];
  let handlers!: LiveHandlers;
  let release: () => void = () => undefined;
  const socket: LiveSocket = {
    appendAudio: (audio) => sent.push(`audio:${audio.length}`),
    commit: () => sent.push('commit'),
    close: jest.fn(),
  };
  const open = jest.fn(async (given: LiveHandlers) => {
    handlers = given;
    if (delay) await new Promise<void>((resolve) => (release = resolve));
    return opens ? socket : null;
  });
  return {
    open,
    sent,
    socket,
    release: () => release(),
    say: (event: LiveEvent) => handlers.onEvent(event),
    drop: () => handlers.onClose(),
  };
}
const settle = () => act();
const act = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};
const commits = (sent: string[]) => sent.filter((op) => op === 'commit').length;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('a live take', () => {
  it('opens no connection if nothing is ever captured', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(null);
    expect(await take.outcome).toEqual({ ok: false });
    expect(link.open).not.toHaveBeenCalled();
  });

  it('streams what is captured, ends a turn at each pause, and joins the turns in the order spoken', async () => {
    const link = connection();
    const changed = jest.fn();
    const take = createLiveTake({ open: link.open }, changed);

    take.push(sound(2, true));
    await settle();
    link.say({ kind: 'delta', itemId: 'one', text: ' I miss' });
    link.say({ kind: 'delta', itemId: 'one', text: ' him' });
    expect(take.text()).toBe('I miss him');
    expect(changed).toHaveBeenCalled();

    take.push(sound(1.5, false)); // A pause: the first turn ends.
    expect(commits(link.sent)).toBe(1);
    link.say({ kind: 'committed', itemId: 'one' });

    take.push(sound(2, true));
    link.say({ kind: 'delta', itemId: 'two', text: ' Actually no' });
    take.push(null); // Capture ends with a turn open: it is ended too.
    expect(commits(link.sent)).toBe(2);
    link.say({ kind: 'committed', itemId: 'two' });

    // Completions come back the other way round.
    link.say({ kind: 'completed', itemId: 'two', text: 'Actually no.' });
    expect(take.text()).toContain('Actually no.');
    link.say({ kind: 'completed', itemId: 'one', text: 'I miss him.' });
    expect(await take.outcome).toEqual({ ok: true, text: 'I miss him. Actually no.' });
    expect(link.socket.close).toHaveBeenCalled();
  });

  it('keeps audio spoken while the connection is still opening, and sends it in order once it is', async () => {
    const link = connection({ delay: true });
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    take.push(sound(1.4, false)); // Ends a turn before the socket exists.
    expect(link.sent).toEqual([]);
    link.release();
    await settle();
    expect(link.sent.map((op) => op.split(':')[0])).toEqual(['audio', 'audio', 'commit']);
    take.push(sound(0.5, true));
    expect(link.sent.at(-1)?.startsWith('audio')).toBe(true);
    take.abort();
  });

  it('commits a long run of speech at the longest turn it allows', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    await settle();
    for (let second = 1; second < 65; second += 1) take.push(sound(1, true));
    expect(commits(link.sent)).toBe(2);
    take.abort();
  });

  it('falls back when the connection drops mid-take, and the take goes on being fed without harm', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    await settle();
    link.say({ kind: 'delta', itemId: 'one', text: ' hello' });
    const before = link.sent.length;

    link.drop();
    expect(take.failed()).toBe(true);
    expect(await take.outcome).toEqual({ ok: false });
    // Recording carries on: more audio arrives, and nothing throws or is sent.
    expect(() => {
      take.push(sound(1, true));
      take.push(sound(2, false));
      take.push(null);
    }).not.toThrow();
    expect(link.sent.length).toBe(before);
  });

  it('falls back when the connection cannot be opened at all', async () => {
    const link = connection({ opens: false });
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    expect(await take.outcome).toEqual({ ok: false });
    expect(take.failed()).toBe(true);
  });

  it('falls back when the connection throws, and when a send throws', async () => {
    const throwing = createLiveTake(
      { open: async () => Promise.reject(new Error('boom')) },
      jest.fn(),
    );
    throwing.push(sound(1, true));
    expect(await throwing.outcome).toEqual({ ok: false });

    const link = connection();
    link.socket.appendAudio = () => {
      throw new Error('closed');
    };
    const sending = createLiveTake({ open: link.open }, jest.fn());
    sending.push(sound(0.2, true));
    await settle();
    sending.push(sound(0.2, true));
    expect(await sending.outcome).toEqual({ ok: false });
  });

  it('gives up on a connection that is too slow, rather than keep holding the voice', async () => {
    const link = connection({ delay: true });
    const take = createLiveTake({ open: link.open }, jest.fn());
    for (let second = 0; second < 25; second += 1) take.push(sound(1, true));
    expect(take.failed()).toBe(true);
    expect(await take.outcome).toEqual({ ok: false });
    link.release();
    await settle();
    expect(link.sent).toEqual([]);
    expect(link.socket.close).toHaveBeenCalled();
  });

  it('falls back at once when the server reports an error mid-take, and does not reconnect', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    await settle();
    link.say({ kind: 'delta', itemId: 'one', text: ' hello' });
    // The server refused something: from here the words cannot be trusted to be whole.
    link.say({ kind: 'error' });
    expect(take.failed()).toBe(true);
    expect(await take.outcome).toEqual({ ok: false });
    expect(link.socket.close).toHaveBeenCalledTimes(1);

    const before = link.sent.length;
    take.push(sound(1, true));
    take.push(sound(2, false));
    take.push(null);
    expect(link.sent.length).toBe(before);
    expect(link.open).toHaveBeenCalledTimes(1);
  });

  it('falls back when an error arrives after the person has stopped, even with every turn finished', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    await settle();
    take.push(sound(2, false));
    link.say({ kind: 'committed', itemId: 'one' });
    take.push(null);
    link.say({ kind: 'error' });
    link.say({ kind: 'completed', itemId: 'one', text: 'Everything.' });
    expect(await take.outcome).toEqual({ ok: false });
  });

  it('falls back when a turn fails to become words', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    await settle();
    link.say({ kind: 'committed', itemId: 'one' });
    take.push(null);
    link.say({ kind: 'item_failed', itemId: 'one' });
    expect(await take.outcome).toEqual({ ok: false });
  });

  it('does not take a short last phrase for nothing: it waits for the commit it sent to come back', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    let early: Awaited<typeof take.outcome> | undefined;
    void take.outcome.then((outcome) => (early = outcome));

    take.push(sound(1, true));
    await settle();
    take.push(sound(2, false)); // A pause: the first turn ends.
    link.say({ kind: 'delta', itemId: 'one', text: ' First turn.' });
    link.say({ kind: 'committed', itemId: 'one' });
    link.say({ kind: 'completed', itemId: 'one', text: 'First turn.' });

    take.push(sound(1, true)); // A short last phrase, and the model has not said a word of it yet.
    take.push(null);
    expect(commits(link.sent)).toBe(2);
    await settle();
    expect(early).toBeUndefined();
    expect(link.socket.close).not.toHaveBeenCalled();

    link.say({ kind: 'committed', itemId: 'two' });
    await settle();
    expect(early).toBeUndefined(); // Acknowledged, but its words are not in.
    link.say({ kind: 'completed', itemId: 'two', text: 'And the last words.' });
    expect(await take.outcome).toEqual({ ok: true, text: 'First turn. And the last words.' });
  });

  it('falls back to the recording if the last phrase never comes back at all', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    await settle();
    take.push(sound(2, false));
    link.say({ kind: 'committed', itemId: 'one' });
    link.say({ kind: 'completed', itemId: 'one', text: 'First turn.' });
    take.push(sound(1, true));
    take.push(null);
    jest.advanceTimersByTime(FINISH_MS);
    expect(await take.outcome).toEqual({ ok: false });
    expect(take.failed()).toBe(true);
  });

  it('falls back to the recording, not to partial words, if the last completion never arrives', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    await settle();
    link.say({ kind: 'delta', itemId: 'one', text: ' still here' });
    take.push(null);
    link.say({ kind: 'committed', itemId: 'one' });
    jest.advanceTimersByTime(FINISH_MS);
    expect(await take.outcome).toEqual({ ok: false });
  });

  it('is not held up by a pause at the end: a take that stops in silence after its words is whole', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    await settle();
    take.push(sound(3, false)); // The turn ended at the pause.
    link.say({ kind: 'committed', itemId: 'one' });
    link.say({ kind: 'completed', itemId: 'one', text: 'All of it.' });
    take.push(null); // Stopped in the quiet: nothing is open, so no further commit is owed.
    expect(commits(link.sent)).toBe(1);
    expect(await take.outcome).toEqual({ ok: true, text: 'All of it.' });
  });

  it('ends with no words when nothing was heard, so the recording is what is used', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, false));
    await settle();
    take.push(null);
    expect(await take.outcome).toEqual({ ok: true, text: '' });
    expect(commits(link.sent)).toBe(0);
  });

  it('hangs up at once when told to, as when the person hides their words', async () => {
    const link = connection();
    const take = createLiveTake({ open: link.open }, jest.fn());
    take.push(sound(1, true));
    await settle();
    take.abort();
    expect(link.socket.close).toHaveBeenCalledTimes(1);
    expect(await take.outcome).toEqual({ ok: false });
    take.push(sound(1, true));
    expect(link.sent.filter((op) => op.startsWith('audio')).length).toBe(1);
  });

  it('has no length limit of its own: an hour of speaking with pauses is heard turn by turn', async () => {
    const sent: string[] = [];
    let turn = 0;
    let handlers!: LiveHandlers;
    const socket: LiveSocket = {
      appendAudio: (audio) => sent.push(`audio:${audio.length}`),
      commit: () => {
        // The server answers each commit with the turn's words, as it does.
        turn += 1;
        const itemId = `turn_${turn}`;
        handlers.onEvent({ kind: 'delta', itemId, text: ` turn ${turn}` });
        handlers.onEvent({ kind: 'committed', itemId });
        handlers.onEvent({ kind: 'completed', itemId, text: `Turn ${turn}.` });
        sent.push('commit');
      },
      close: jest.fn(),
    };
    const take = createLiveTake(
      {
        open: async (given) => {
          handlers = given;
          return socket;
        },
      },
      jest.fn(),
    );
    take.push(sound(1, true));
    await settle();
    // Sixty minutes: forty seconds of speech, then a pause, over and over.
    for (let minute = 0; minute < 60; minute += 1) {
      for (let second = 0; second < 30; second += 1) take.push(sound(1, true));
      for (let second = 0; second < 30; second += 1) take.push(sound(1, false));
    }
    expect(take.failed()).toBe(false);
    take.push(null);
    const outcome = await take.outcome;
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.text.startsWith('Turn 1. Turn 2.')).toBe(true);
      expect(outcome.text.endsWith(`Turn ${turn}.`)).toBe(true);
    }
    // Sixty turns of a minute, and not one of them is a reason to stop.
    expect(turn).toBeGreaterThanOrEqual(60);
    const audio = sent.filter((op) => op.startsWith('audio')).length;
    expect(audio).toBe(60 * 60 + 1);
  });
});
