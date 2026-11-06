import { FULL, FULL_OPENINGS, SHORT, ritualFor } from './ritual';

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
});
