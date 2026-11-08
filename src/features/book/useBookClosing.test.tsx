// The order of things as the book shuts, and the time at which the next screen may be asked for.
// What each part looks like is judged by eye; here is when it happens, and that it always ends.
// The closing follows the book's own animations: the cover landing, and the book beginning to sink. A
// phone that is behind the clock is a landing that comes late, and these say nothing happens before it
// does. The next screen is asked for as the cover lands, so that it is arriving as the book sinks: asked
// for after the sink, the sky was bare for as long as the screen takes to mount.
import { act, renderHook } from '@testing-library/react-native';

import { cue } from '@/design/haptics';

import {
  CLOSE_REDUCED_MS,
  FULL,
  HURRY_MS,
  SHORT,
  UI_HANG_MS,
  closeTimeline,
  type Ritual,
} from './ritual';
import { useBookClosing } from './useBookClosing';

jest.mock('@/design/haptics');

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

const tick = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function closing(ritual: Ritual, reduced = false) {
  const view = await renderHook(() => useBookClosing(ritual, reduced));
  const state = () => view.result.current.closing;
  let went = false;
  // Starts the closing without waiting for it, which is what the session does until it is time to go.
  const begin = async (options?: Parameters<typeof view.result.current.begin>[0]) => {
    await act(async () => {
      void view.result.current.begin(options).then(() => (went = true));
    });
  };
  const hurry = () => act(async () => view.result.current.hurry());
  // What the book says: its cover is down, and its sink has begun.
  const landed = () => act(async () => view.result.current.landed());
  const sinkBegun = () => act(async () => view.result.current.sinkBegun());
  return { view, state, begin, hurry, landed, sinkBegun, went: () => went };
}

describe('the book shutting', () => {
  it.each([
    ['in full', FULL],
    ['once practised', SHORT],
  ])(
    'asks for the next screen as the cover lands, and sinks after its rest, %s',
    async (_, ritual) => {
      const { begin, went, state, landed } = await closing(ritual);
      await begin();
      const t = closeTimeline(ritual);
      expect(state()).toMatchObject({ contact: false, sinking: false, hurry: false });
      // The clock says the cover is down; the book has not said so, and nothing goes on without it.
      await tick(t.contactAt + 400);
      expect(state()).toMatchObject({ contact: false, sinking: false });
      expect(went()).toBe(false);
      await landed();
      // Down: the next screen is asked for at once and arrives as the book rests and sinks.
      expect(state()).toMatchObject({ contact: true, sinking: false });
      expect(went()).toBe(true);
      await tick(ritual.close.gap - 1);
      expect(state()).toMatchObject({ sinking: false });
      await tick(1);
      expect(state()).toMatchObject({ contact: true, sinking: true });
    },
  );

  it('keeps the order: contact is felt before the next screen is asked for, and the sink comes last', async () => {
    const order: string[] = [];
    jest.mocked(cue).mockImplementation(() => void order.push('contact'));
    const view = await renderHook(() => useBookClosing(FULL, false));
    await act(async () => {
      void view.result.current.begin().then(() => order.push('next screen'));
    });
    await act(async () => view.result.current.landed());
    await tick(FULL.close.gap);
    order.push(view.result.current.closing?.sinking ? 'sink' : 'not sinking');
    expect(order).toEqual(['contact', 'next screen', 'sink']);
  });

  it('is felt once, where the cover lands, and on nothing else', async () => {
    const { begin, landed, sinkBegun } = await closing(FULL);
    await begin();
    await tick(closeTimeline(FULL).contactAt + 600);
    expect(cue).not.toHaveBeenCalled();
    await landed();
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('settle');
    await tick(FULL.close.gap + 10);
    await sinkBegun();
    await tick(2000);
    expect(cue).toHaveBeenCalledTimes(1);
  });

  it('is as quick as the book is: a cover that lands early is felt early', async () => {
    const { begin, landed, state } = await closing(FULL);
    await begin();
    await tick(100);
    await landed();
    expect(state()).toMatchObject({ contact: true });
    expect(cue).toHaveBeenCalledTimes(1);
  });

  it('is not lost if the book says it has landed before it is waited for', async () => {
    const { begin, landed, state, went } = await closing(FULL);
    await landed();
    await begin();
    await tick(0);
    expect(state()).toMatchObject({ contact: true });
    expect(went()).toBe(true);
  });

  it('is begun once: a second Reflect finds the same closing', async () => {
    const { view } = await closing(FULL);
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = view.result.current.begin();
      second = view.result.current.begin();
    });
    expect(second).toBe(first);
  });

  it('keeps the closed book still, and the next screen away, until a question on its cover is answered', async () => {
    const { begin, went, state, landed } = await closing(FULL);
    let answer!: () => void;
    await begin({
      atContact: () => new Promise<void>((resolve) => (answer = resolve)),
      asking: true,
    });
    await landed();
    // Far longer than the book ever rests: it waits, and so does the next screen.
    await tick(30_000);
    expect(state()).toMatchObject({ contact: true, sinking: false });
    expect(went()).toBe(false);
    await act(async () => answer());
    // Answered: the next screen is asked for, and the book sinks after its rest, over its arrival.
    expect(went()).toBe(true);
    await tick(FULL.close.gap);
    expect(state()).toMatchObject({ sinking: true });
  });
});

describe('a closing that the book does not answer', () => {
  // A net is for a UI thread that has stopped altogether. The book (./BookStage) says when its cover has
  // landed, from the cover's own animation and its own net, measured from the UI thread's first frame;
  // this one is only the last word, a very long way after, so that it can never go off before the motion.
  it('feels the cover down, and goes on, only a very long time after it was due', async () => {
    const { begin, state, went } = await closing(FULL);
    await begin();
    const at = closeTimeline(FULL).contactAt + UI_HANG_MS;
    await tick(closeTimeline(FULL).contactAt + 8000);
    expect(state()).toMatchObject({ contact: false });
    expect(cue).not.toHaveBeenCalled();
    expect(went()).toBe(false);
    await tick(at - closeTimeline(FULL).contactAt - 8000 - 1);
    expect(state()).toMatchObject({ contact: false });
    await tick(1);
    expect(state()).toMatchObject({ contact: true });
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('settle');
    expect(went()).toBe(true);
  });

  it('does not go on a second or two after the clock, on a UI thread that is two seconds late', async () => {
    const { begin, state, went } = await closing(FULL);
    await begin();
    await tick(closeTimeline(FULL).contactAt + 2400);
    expect(state()).toMatchObject({ contact: false });
    expect(cue).not.toHaveBeenCalled();
    expect(went()).toBe(false);
  });

  it('lets the session go on when the screen is taken down in the middle of it', async () => {
    const { view, begin, went } = await closing(FULL);
    await begin();
    await tick(100);
    await view.unmount();
    await act(async () => undefined);
    expect(went()).toBe(true);
  });
});

describe('a tap that says enough', () => {
  it('finishes everything together, with no buzz, and asks for the next screen as the hurried book begins to sink', async () => {
    const { begin, hurry, went, state, sinkBegun } = await closing(FULL);
    await begin();
    await tick(200);
    await hurry();
    expect(state()).toMatchObject({ hurry: true, contact: true, sinking: true });
    // However long the UI thread takes to begin it, the next screen waits for it to have begun.
    await tick(HURRY_MS + 2500);
    expect(went()).toBe(false);
    await sinkBegun();
    expect(went()).toBe(true);
    await tick(3000);
    expect(cue).not.toHaveBeenCalled();
  });

  it('goes on anyway only when the hurried book is never heard of, a very long time after', async () => {
    const { begin, hurry, went } = await closing(FULL);
    await begin();
    await hurry();
    await tick(HURRY_MS + 8000);
    expect(went()).toBe(false);
    await tick(UI_HANG_MS - 8000 - 1);
    expect(went()).toBe(false);
    await tick(1);
    expect(went()).toBe(true);
  });

  it('does not ask the question: the closing it hurried never reached the cover being down', async () => {
    const { begin, hurry, sinkBegun, landed } = await closing(FULL);
    const atContact = jest.fn(async () => undefined);
    await begin({ atContact, asking: true });
    await tick(300);
    await hurry();
    await landed();
    await sinkBegun();
    await tick(5000);
    expect(atContact).not.toHaveBeenCalled();
  });

  it('is not taken from a person who is answering the book', async () => {
    const { view, begin, hurry, state, landed } = await closing(FULL);
    await begin({ atContact: () => new Promise<void>(() => undefined), asking: true });
    await landed();
    expect(view.result.current.isHolding()).toBe(true);
    await hurry();
    expect(state()).toMatchObject({ hurry: false, sinking: false });
  });

  it('can be made only once, and does nothing before the closing has begun', async () => {
    const { view, begin, hurry, went, sinkBegun } = await closing(FULL);
    await hurry();
    expect(view.result.current.closing).toBeNull();
    await begin();
    await hurry();
    await hurry();
    await sinkBegun();
    expect(went()).toBe(true);
  });
});

describe('Reduce Motion', () => {
  it('fades the book with everything else and asks for the next screen at 180 ms, with one commit', async () => {
    const { begin, went, state } = await closing(FULL, true);
    await begin();
    expect(state()).toMatchObject({ reduced: true, sinking: true });
    await tick(CLOSE_REDUCED_MS - 1);
    expect(went()).toBe(false);
    await tick(1);
    expect(went()).toBe(true);
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('commit');
  });

  it('shows the closed cover first when there is a question to ask, and then fades', async () => {
    const { begin, went, state } = await closing(FULL, true);
    let answer!: () => void;
    await begin({ asking: true, atContact: () => new Promise<void>((r) => (answer = r)) });
    expect(state()).toMatchObject({ reduced: true, sinking: false });
    await tick(CLOSE_REDUCED_MS);
    expect(state()).toMatchObject({ contact: true, sinking: false });
    await act(async () => answer());
    await tick(0);
    expect(state()).toMatchObject({ sinking: true });
    await tick(CLOSE_REDUCED_MS);
    expect(went()).toBe(true);
  });
});
