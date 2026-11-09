import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { render } from '@/testing/render';

import { sessionCopy } from './sessionCopy';
import { moonPath, TranscribingMoon } from './TranscribingMoon';

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => false }));

describe('the moon’s phases', () => {
  it('is a closed path from the top of the moon to the bottom and back', () => {
    const d = moonPath(0.3, 12, 12, 9);
    expect(d.startsWith('M 12 3 A 9 9 0 0 1 12 21 A ')).toBe(true);
    expect(d.endsWith(' 12 3 Z')).toBe(true);
  });

  it('lights the right as it waxes and the left as it wanes', () => {
    expect(moonPath(0.2, 12, 12, 9)).toContain('A 9 9 0 0 1 12 21');
    expect(moonPath(0.7, 12, 12, 9)).toContain('A 9 9 0 0 0 12 21');
  });

  it('has no width to its terminator at the quarters, and the moon’s at new and full', () => {
    const rx = (phase: number) =>
      Number(/A ([\d.]+) 9 0 0 [01] 12 3 Z$/.exec(moonPath(phase, 12, 12, 9))?.[1]);
    expect(rx(0.25)).toBeCloseTo(0, 5);
    expect(rx(0.75)).toBeCloseTo(0, 5);
    expect(rx(0)).toBeCloseTo(9, 5);
    expect(rx(0.5)).toBeCloseTo(9, 5);
  });

  it('bows the terminator toward the dark for a crescent and toward the light when gibbous', () => {
    // Waxing crescent: the terminator runs up the right; waxing gibbous: up the left.
    expect(moonPath(0.1, 12, 12, 9)).toMatch(/ 0 0 0 12 3 Z$/);
    expect(moonPath(0.4, 12, 12, 9)).toMatch(/ 0 0 1 12 3 Z$/);
    // Waning gibbous: up the right; waning crescent: up the left.
    expect(moonPath(0.6, 12, 12, 9)).toMatch(/ 0 0 0 12 3 Z$/);
    expect(moonPath(0.9, 12, 12, 9)).toMatch(/ 0 0 1 12 3 Z$/);
  });

  it('turns past a full cycle as if it began again', () => {
    expect(moonPath(1.3, 12, 12, 9)).toBe(moonPath(0.3, 12, 12, 9));
  });
});

describe('the moon over the page', () => {
  const opacity = () =>
    (
      StyleSheet.flatten(
        screen.getByTestId('transcribing-moon', { includeHiddenElements: true }).props.style,
      ) as { opacity?: number }
    ).opacity;

  it('is there, and says so to a screen reader, while words are on their way', async () => {
    const view = await render(<TranscribingMoon visible top={40} />);
    // Drawn again, as a frame would be, once it has come.
    await view.rerender(
      <ThemeProvider crossfade={false}>
        <TranscribingMoon visible top={40} />
      </ThemeProvider>,
    );
    expect(opacity()).toBe(1);
    expect(screen.getByLabelText(sessionCopy.transcribe.listening)).toBeTruthy();
  });

  it('is not there, and says nothing, once they have landed', async () => {
    await render(<TranscribingMoon visible={false} top={40} />);
    expect(opacity()).toBe(0);
    expect(screen.queryByLabelText(sessionCopy.transcribe.listening)).toBeNull();
  });
});
