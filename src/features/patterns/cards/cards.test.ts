import { constellation, daySpan, numeral } from './PlayingCard';
import { SCENES, sceneFor } from './scenes';

const card = (name: string, noticed = '', quotes: string[] = []) => ({
  name,
  noticed,
  evidence: quotes.map((quote) => ({ quote, date: '2026-11-03' })),
});

describe('pattern card scenes', () => {
  it('chooses the scene a card’s own words call, the name counting most', () => {
    expect(sceneFor(card('Saying yes too quickly'))).toBe('approval-addict');
    expect(sceneFor(card('Rest that has to be earned', 'Rest comes only after the list.'))).toBe(
      'pleasure-exiler',
    );
    expect(sceneFor(card('Worry before sleep', 'You write about worry at night.'))).toBe(
      'hyper-vigilant',
    );
  });

  it('gives a card whose words call nothing the unwritten page', () => {
    expect(sceneFor(card('Quiet mornings', 'Mornings are calm.'))).toBe('unwritten');
  });

  it('matches whole words only, so "yesterday" is not a yes', () => {
    expect(sceneFor(card('Yesterday’s light'))).toBe('unwritten');
  });

  it('is stable: the same card always wears the same scene', () => {
    const one = card('Saying sorry for resting', 'Sorry and rest arrive together.');
    expect(sceneFor(one)).toBe(sceneFor({ ...one }));
  });

  it('has a painting for every scene it can choose', () => {
    for (const id of Object.keys(SCENES)) expect(SCENES[id as keyof typeof SCENES]).toBeTruthy();
  });
});

describe('pattern card facts', () => {
  it('numbers cards as a playing card’s index', () => {
    expect([1, 2, 3, 4, 9, 14].map(numeral)).toEqual(['I', 'II', 'III', 'IV', 'IX', 'XIV']);
  });

  it('says the days its words were written, plainly', () => {
    expect(daySpan(['2026-11-03'])).toBe('NOV 3');
    expect(daySpan(['2026-11-05', '2026-11-03'])).toBe('NOV 3 – 5');
    expect(daySpan(['2026-10-30', '2026-11-02'])).toBe('OCT 30 – NOV 2');
    expect(daySpan(['not a date'])).toBe('');
  });

  it('draws the same stars for the same card, inside the sky of the scene', () => {
    const a = constellation('Saying yes too quickly', 300);
    expect(a).toEqual(constellation('Saying yes too quickly', 300));
    expect(a).toHaveLength(5);
    for (const star of a) {
      expect(star.x).toBeGreaterThan(0);
      expect(star.x).toBeLessThan(300);
      expect(star.y).toBeLessThan(300 * 0.31);
    }
    expect(constellation('Rest that has to be earned', 300)).not.toEqual(a);
  });
});
