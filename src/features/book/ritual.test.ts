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
