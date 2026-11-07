import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { aboutBreath, PatternCardView } from '@/features/patterns/PatternCardView';
import type { PatternCard } from '@/services/patterns';
import { render } from '@/testing/render';

import { breatheCopy } from './breatheCopy';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));

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

  it('offers a quiet Breathe on a card whose practice is about breath', async () => {
    await render(
      <PatternCardView card={card('Take one slow breath first.')} index={1} total={1} />,
    );
    await fireEvent.press(screen.getByRole('link', { name: breatheCopy.cardLink }));
    expect(router.navigate).toHaveBeenCalledWith('/home/breathe');
  });

  it('offers nothing on any other card', async () => {
    await render(<PatternCardView card={card('Write one line.')} index={1} total={1} />);
    expect(screen.queryByRole('link', { name: breatheCopy.cardLink })).toBeNull();
  });
});
