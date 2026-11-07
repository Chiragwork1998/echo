import { tokens } from '@/design/tokens';

import { gradientFrom } from './readability';

describe("ECHO's readability scrim, read from the tokens", () => {
  it('runs the top gradient down from the top, fading to the same colour at no opacity', () => {
    expect(gradientFrom(tokens.gradient.readabilityTop)).toEqual({
      colors: ['rgba(4,14,28,.48)', 'rgba(4,14,28,.08)', 'rgba(4,14,28,0)'],
      locations: [0, 0.42, 0.7],
      start: { x: 0.5, y: 0 },
      end: { x: 0.5, y: 1 },
    });
  });

  it('runs the bottom gradient up from the bottom', () => {
    expect(gradientFrom(tokens.gradient.readabilityBottom)).toEqual({
      colors: ['rgba(3,11,22,.70)', 'rgba(3,11,22,.12)', 'rgba(3,11,22,0)'],
      locations: [0, 0.48, 0.75],
      start: { x: 0.5, y: 1 },
      end: { x: 0.5, y: 0 },
    });
  });

  it('refuses something it cannot read rather than draw the wrong thing', () => {
    expect(() => gradientFrom('none')).toThrow();
  });
});
