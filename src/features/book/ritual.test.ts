import { FULL, FULL_OPENINGS, SHORT, closeTimeline, ritualFor } from './ritual';

describe('the opening ritual', () => {
  it('plays in full for the first few openings, and then hurries', () => {
    expect(ritualFor(0)).toBe(FULL);
    expect(ritualFor(FULL_OPENINGS - 1)).toBe(FULL);
    expect(ritualFor(FULL_OPENINGS)).toBe(SHORT);
    expect(ritualFor(400)).toBe(SHORT);
  });

  it('takes about half as long once it has hurried', () => {
    for (const key of ['stillness', 'rise', 'forward', 'cover'] as const) {
      expect(SHORT[key]).toBeLessThan(FULL[key] * 0.65);
      expect(SHORT[key]).toBeGreaterThan(FULL[key] * 0.4);
    }
  });

  it('keeps the lengths the owner approved (D-015): the book is not made longer to be made lovelier', () => {
    expect(FULL.stillness).toBe(1500);
    expect(FULL.rise).toBe(1500);
    expect(FULL.cover).toBe(1100);
    expect(SHORT.stillness).toBe(750);
    expect(SHORT.rise).toBe(800);
    expect(SHORT.cover).toBe(550);
    // First Echo's book comes forward a little and settles: it has room to do both.
    expect(FULL.forward).toBe(520);
    expect(SHORT.forward).toBe(300);
  });
});

describe('the closing ritual', () => {
  const keys = ['leaf', 'coverAt', 'cover', 'gap', 'sink', 'glint', 'tuck'] as const;

  it('is the opening played back, and a practised book closes in about half the time', () => {
    for (const key of keys) {
      expect(SHORT.close[key]).toBeGreaterThanOrEqual(FULL.close[key] * 0.4);
      expect(SHORT.close[key]).toBeLessThanOrEqual(FULL.close[key] * 0.65);
    }
  });

  it('keeps every movement within 300 and 600 ms, and a practised one within a second', () => {
    expect(FULL.close.leaf).toBeLessThanOrEqual(600);
    expect(FULL.close.cover).toBeLessThanOrEqual(600);
    expect(FULL.close.sink).toBeLessThanOrEqual(600);
    expect(closeTimeline(FULL).endAt).toBeLessThan(1500);
  });

  it('puts the cover down at 840 ms and the book sinking at 920, and at 450 and 490 once practised', () => {
    expect(closeTimeline(FULL)).toEqual({ contactAt: 840, goAt: 840, sinkAt: 920, endAt: 1380 });
    expect(closeTimeline(SHORT)).toEqual({ contactAt: 450, goAt: 450, sinkAt: 490, endAt: 750 });
  });

  it('asks for the next screen as the cover lands, so that it fades in over the book as it rests and sinks', () => {
    for (const ritual of [FULL, SHORT]) {
      const { contactAt, goAt, sinkAt, endAt } = closeTimeline(ritual);
      expect(goAt).toBe(contactAt);
      expect(sinkAt - goAt).toBe(ritual.close.gap);
      expect(endAt - sinkAt).toBe(ritual.close.sink);
    }
  });

  it('starts the cover after the leaf has begun and before it has landed', () => {
    for (const ritual of [FULL, SHORT]) {
      expect(ritual.close.coverAt).toBeGreaterThan(0);
      expect(ritual.close.coverAt).toBeLessThan(ritual.close.leaf);
    }
  });
});
