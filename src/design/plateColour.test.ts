import { backgroundColours } from './generated/backgrounds';
import { plateColour } from './plateColour';

describe('plateColour', () => {
  it('gives each screen the dominant colour of its own plate, in the right theme', () => {
    expect(plateColour('night', 'intent', 'red')).toBe(backgroundColours.night.intent);
    expect(plateColour('day', 'first-echo', 'red')).toBe(backgroundColours.day['first-echo']);
  });

  it('falls back for a route that has no plate', () => {
    expect(plateColour('night', 'echoes', '#0B1D35')).toBe('#0B1D35');
  });

  it('never returns white or an empty colour for any plate', () => {
    for (const theme of ['day', 'night'] as const) {
      for (const value of Object.values(backgroundColours[theme])) {
        expect(value).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
        expect(value).not.toBe('rgb(255,255,255)');
      }
    }
  });
});
