import {
  createResampler,
  createTurnDetector,
  LIVE_RATE,
  pcmToBase64,
  toMono,
  TURN,
} from './liveAudio';

/** `seconds` of a loud tone, or of silence, as the samples a microphone would give. */
const sound = (seconds: number, loud: boolean, rate = LIVE_RATE) => {
  const samples = new Int16Array(Math.round(seconds * rate));
  if (loud)
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.round(6000 * Math.sin(i / 5));
  return samples;
};

describe('pcmToBase64', () => {
  it('matches the standard encoding of the little-endian bytes, at every length', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 99, 4800]) {
      const samples = new Int16Array(length).map((_, i) => ((i * 7919) % 65536) - 32768);
      const bytes = Buffer.from(samples.buffer);
      expect(pcmToBase64(samples)).toBe(bytes.toString('base64'));
    }
  });
});

describe('toMono', () => {
  it('averages the channels, and leaves mono alone', () => {
    expect([...toMono(new Int16Array([2, 4, 6, 8]), 2)]).toEqual([3, 7]);
    const mono = new Int16Array([1, 2, 3]);
    expect(toMono(mono, 1)).toBe(mono);
  });
});

describe('createResampler', () => {
  it('leaves 24 kHz as it is', () => {
    const input = new Int16Array([1, 2, 3]);
    expect(createResampler(24_000, 24_000)(input)).toBe(input);
  });

  it.each([48_000, 44_100, 16_000, 22_050])(
    'brings %i Hz to 24 kHz, in any pieces, without drift',
    (rate) => {
      const total = rate * 3;
      const input = new Int16Array(total).fill(1000);
      const whole = createResampler(rate, LIVE_RATE)(input);
      expect(Math.abs(whole.length - LIVE_RATE * 3)).toBeLessThanOrEqual(2);

      const resample = createResampler(rate, LIVE_RATE);
      const pieces: Int16Array[] = [];
      // The odd sizes a microphone delivers, not a tidy fraction of a second.
      for (let at = 0; at < total;) {
        const size = 313 + (pieces.length % 7) * 211;
        pieces.push(resample(input.subarray(at, at + size)));
        at += size;
      }
      const length = pieces.reduce((sum, piece) => sum + piece.length, 0);
      expect(Math.abs(length - LIVE_RATE * 3)).toBeLessThanOrEqual(2);
      // A steady level stays that level: no clicks at the joins.
      for (const piece of pieces)
        for (const sample of piece) expect(Math.abs(sample - 1000)).toBeLessThanOrEqual(1);
    },
  );

  it('is the average of what it covers when it halves the rate', () => {
    const out = createResampler(48_000, 24_000)(new Int16Array([0, 100, 200, 300, 400, 500]));
    expect([...out]).toEqual([50, 250, 450]);
  });
});

describe('createTurnDetector', () => {
  it('ends a turn at a pause that follows speech, once', () => {
    const detector = createTurnDetector();
    expect(detector.push(sound(2, true))).toBe(0);
    expect(detector.pending()).toBe(true);
    expect(detector.push(sound(1.0, false))).toBe(0);
    expect(detector.push(sound(0.5, false))).toBe(1);
    expect(detector.pending()).toBe(false);
    expect(detector.push(sound(3, false))).toBe(0);
  });

  it('does not end a turn at a short pause between words', () => {
    const detector = createTurnDetector();
    let ended = 0;
    for (let i = 0; i < 5; i += 1) {
      ended += detector.push(sound(1, true));
      ended += detector.push(sound(0.6, false));
    }
    expect(ended).toBe(0);
  });

  it('ends a turn that runs on, at the longest it may be', () => {
    const detector = createTurnDetector();
    let ended = 0;
    for (let second = 0; second < 75; second += 1) ended += detector.push(sound(1, true));
    expect(ended).toBe(2);
    expect(TURN.maxMs).toBe(30_000);
  });

  it('does not take a click or a quiet room for a turn', () => {
    const detector = createTurnDetector();
    let ended = detector.push(sound(0.1, true));
    ended += detector.push(sound(40, false));
    expect(ended).toBe(0);
    expect(detector.pending()).toBe(false);
  });

  it('is not fooled by a steady hum', () => {
    const detector = createTurnDetector();
    const hum = new Int16Array(LIVE_RATE * 5).map((_, i) => Math.round(120 * Math.sin(i / 3)));
    expect(detector.push(hum)).toBe(0);
    expect(detector.pending()).toBe(false);
  });

  it('knows at the end of capture whether a turn was left open', () => {
    const detector = createTurnDetector();
    detector.push(sound(1, true));
    expect(detector.pending()).toBe(true);
  });
});
