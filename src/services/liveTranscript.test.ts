import { createLiveTranscript } from './liveTranscript';
import { parseLiveEvent, type LiveEvent } from './liveTranscription';

const delta = (itemId: string, text: string): LiveEvent => ({ kind: 'delta', itemId, text });
const committed = (itemId: string): LiveEvent => ({ kind: 'committed', itemId });
const completed = (itemId: string, text: string): LiveEvent => ({
  kind: 'completed',
  itemId,
  text,
});

const feed = (events: LiveEvent[]) => {
  const transcript = createLiveTranscript();
  events.forEach((event) => transcript.apply(event));
  return transcript;
};

describe('the live transcript', () => {
  it('shows partial words as they arrive, in the one turn', () => {
    const transcript = feed([delta('a', ' I'), delta('a', ' am'), delta('a', ' here')]);
    expect(transcript.text()).toBe('I am here');
    expect(transcript.settled()).toBe(false);
    expect(transcript.hasOpenWords()).toBe(true);
  });

  it('puts turns in the order they were spoken when their completions arrive out of order', () => {
    const transcript = feed([
      delta('item_1', ' First'),
      delta('item_1', ' thing'),
      committed('item_1'),
      delta('item_2', ' second'),
      committed('item_2'),
      delta('item_3', ' third'),
      committed('item_3'),
      // The last turn finishes first, then the first, then the middle one.
      completed('item_3', 'Third, finally.'),
      completed('item_1', 'First thing.'),
      completed('item_2', 'Second one.'),
    ]);
    expect(transcript.text()).toBe('First thing. Second one. Third, finally.');
    expect(transcript.settled()).toBe(true);
  });

  it('matches by item id, not by what arrived last', () => {
    const transcript = feed([
      delta('b', ' world'),
      delta('a', ' hello'),
      committed('a'),
      committed('b'),
    ]);
    // 'a' was committed first, whatever order their words came in.
    expect(transcript.text()).toBe('hello world');
  });

  it('lets a completion correct the partial words, and ignores a late delta after it', () => {
    const transcript = feed([
      delta('a', ' I miss hymn'),
      committed('a'),
      completed('a', 'I miss him.'),
      delta('a', ' stray'),
    ]);
    expect(transcript.text()).toBe('I miss him.');
  });

  it('waits for every committed turn, and for none that said nothing', () => {
    const transcript = feed([
      delta('a', ' one'),
      committed('a'),
      delta('b', ' two'),
      committed('b'),
      completed('b', 'Two.'),
    ]);
    expect(transcript.settled()).toBe(false);
    transcript.apply(completed('a', 'One.'));
    expect(transcript.settled()).toBe(true);
    // A turn of silence, committed, completes with nothing and changes nothing.
    transcript.apply(committed('c'));
    expect(transcript.settled()).toBe(false);
    transcript.apply(completed('c', ''));
    expect(transcript.settled()).toBe(true);
    expect(transcript.text()).toBe('One. Two.');
  });

  it('counts the commits the model has acknowledged, each once', () => {
    const transcript = feed([
      delta('a', ' one'),
      committed('a'),
      committed('a'),
      delta('b', ' two'),
    ]);
    expect(transcript.committed()).toBe(1);
    transcript.apply(committed('b'));
    expect(transcript.committed()).toBe(2);
    // Settled says nothing about a commit that has not been acknowledged yet. That is the take's to count.
    transcript.apply(completed('a', 'One.'));
    transcript.apply(completed('b', 'Two.'));
    expect(transcript.settled()).toBe(true);
    expect(transcript.committed()).toBe(2);
  });

  it('knows when the server reported an error, so the whole cannot be trusted', () => {
    const transcript = feed([delta('a', ' fine'), committed('a'), completed('a', 'Fine.')]);
    expect(transcript.failed()).toBe(false);
    transcript.apply({ kind: 'error' });
    expect(transcript.failed()).toBe(true);
  });

  it('knows when a turn failed, so the whole cannot be trusted', () => {
    const transcript = feed([
      delta('a', ' x'),
      committed('a'),
      { kind: 'item_failed', itemId: 'a' },
    ]);
    expect(transcript.failed()).toBe(true);
    expect(transcript.settled()).toBe(true);
  });

  it('keeps hindi and english as they come', () => {
    const transcript = feed([
      committed('a'),
      completed('a', 'आज मन भारी है'),
      committed('b'),
      completed('b', 'I need rest.'),
    ]);
    expect(transcript.text()).toBe('आज मन भारी है I need rest.');
  });
});

describe('parseLiveEvent', () => {
  const message = (value: unknown) => JSON.stringify(value);

  it('reads the events the transcription session sends', () => {
    expect(
      parseLiveEvent(
        message({
          type: 'conversation.item.input_audio_transcription.delta',
          item_id: 'i',
          delta: ' hi',
        }),
      ),
    ).toEqual({ kind: 'delta', itemId: 'i', text: ' hi' });
    expect(
      parseLiveEvent(
        message({ type: 'input_audio_buffer.committed', item_id: 'i', previous_item_id: null }),
      ),
    ).toEqual({ kind: 'committed', itemId: 'i' });
    expect(
      parseLiveEvent(
        message({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'i',
          transcript: 'Hi.',
        }),
      ),
    ).toEqual({ kind: 'completed', itemId: 'i', text: 'Hi.' });
    expect(
      parseLiveEvent(
        message({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'i' }),
      ),
    ).toEqual({ kind: 'item_failed', itemId: 'i' });
    expect(parseLiveEvent(message({ type: 'error', error: { message: 'x' } }))).toEqual({
      kind: 'error',
    });
  });

  it('ignores what it does not use, and never throws', () => {
    expect(parseLiveEvent(message({ type: 'session.created' }))).toBeNull();
    expect(
      parseLiveEvent(message({ type: 'conversation.item.input_audio_transcription.delta' })),
    ).toBeNull();
    expect(parseLiveEvent('not json')).toBeNull();
    expect(parseLiveEvent(message([1, 2]))).toBeNull();
    expect(parseLiveEvent(new ArrayBuffer(4))).toBeNull();
    expect(parseLiveEvent(undefined)).toBeNull();
  });
});
