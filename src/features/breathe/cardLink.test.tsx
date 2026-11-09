import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { DISSOLVE_MS, HomeDissolveProvider, useHomeDissolve } from '@/features/home/dissolve';
import { aboutBreath, PatternCardView } from '@/features/patterns/PatternCardView';
import type { PatternCard } from '@/services/patterns';
import { render } from '@/testing/render';

import { breatheCopy } from './breatheCopy';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  usePathname: () => '/home/patterns',
}));
// Evening, whatever the hour the tests run: the morning question is tested in become.test.tsx.
jest.mock('@/features/become/morning', () => ({
  ...jest.requireActual('@/features/become/morning'),
  useMorning: () => false,
}));

function Phase() {
  return <Text testID="phase">{useHomeDissolve().phase}</Text>;
}

// Home's dissolve keeps time. The clock is left fake for the whole file: giving it back leaves the
// environment without timers for what unmounts after.
beforeAll(() => {
  jest.useFakeTimers();
});

const card = (practice: string): PatternCard => ({
  name: 'A made-up pattern',
  noticed: 'Something made up for the test.',
  evidence: [{ quote: 'a made-up line', date: '2026-11-04' }],
  lens: { text: 'One way to see it.', source: 'Nobody' },
  practice,
  question: 'What is here?',
});

describe('a pattern card’s way to Breathe', () => {
  it('knows a practice about breath', () => {
    expect(aboutBreath('Take one slow breath before anything else.')).toBe(true);
    expect(aboutBreath('Breathe out slowly, twice.')).toBe(true);
    expect(aboutBreath('Write one line about it.')).toBe(false);
  });

  // Breathe is presented over Home, and Patterns over Home too: a Breathe pushed from Patterns would have
  // shown Patterns through it. It goes the way Home's own Breathe first goes.
  it('offers a quiet Breathe that goes back to Home, which then dissolves into it', async () => {
    await render(
      <HomeDissolveProvider>
        <Phase />
        <PatternCardView card={card('Take one slow breath first.')} index={1} total={1} />
      </HomeDissolveProvider>,
    );
    await fireEvent.press(screen.getByRole('link', { name: breatheCopy.cardLink }));
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
    expect(screen.getByTestId('phase').props.children).toBe('leaving');
    expect(router.push).not.toHaveBeenCalled();
    await act(async () => void jest.advanceTimersByTime(DISSOLVE_MS));
    expect(router.push).toHaveBeenCalledWith('/home/breathe');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('offers nothing on any other card', async () => {
    await render(<PatternCardView card={card('Write one line.')} index={1} total={1} />);
    expect(screen.queryByRole('link', { name: breatheCopy.cardLink })).toBeNull();
  });
});
