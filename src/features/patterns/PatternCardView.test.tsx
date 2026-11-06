import { screen } from '@testing-library/react-native';

import type { PatternCard } from '@/services/patterns';
import { render } from '@/testing/render';

import { figureFor } from './Constellation';
import { PatternCardView } from './PatternCardView';

const card: PatternCard = {
  name: 'Guilty about resting',
  noticed:
    'It seems that rest brings a little guilt with it. You might notice it arrives on schedule.',
  evidence: [
    { quote: 'It is strange to feel guilty about resting', date: '2026-10-24' },
    { quote: 'the guilt arrive on schedule', date: '2026-11-04' },
  ],
  lens: {
    text: 'One way to see this is as a loop.',
    source: 'Joe Dispenza · thoughts and feelings in a loop',
  },
  practice: 'Write two short lines.',
  question: 'What does enough mean on an ordinary day?',
};

describe('PatternCardView', () => {
  it('sets every part of the card in reading order', async () => {
    const { toJSON } = await render(<PatternCardView card={card} index={1} total={3} />);
    const text = JSON.stringify(toJSON());
    const order = [
      'Guilty about resting',
      'It seems that rest brings',
      'It is strange to feel guilty about resting',
      'One way to see this is as a loop.',
      'Idea from Joe Dispenza',
      'Write two short lines.',
      'What does enough mean on an ordinary day?',
    ].map((part) => text.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('names the card as a heading that says where it sits in the set', async () => {
    await render(<PatternCardView card={card} index={2} total={3} />);
    expect(
      screen.getByRole('header', { name: 'Pattern card 2 of 3: Guilty about resting' }),
    ).toBeTruthy();
  });

  it('speaks each part with its heading, and hides the decoration', async () => {
    await render(<PatternCardView card={card} index={1} total={3} />);
    expect(
      screen.getByLabelText(/^In your words\. It is strange to feel guilty about resting/),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        /^A way to see it\. One way to see this is as a loop\. Idea from Joe Dispenza/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Try, for under two minutes. Write two short lines.'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Ask yourself. What does enough mean on an ordinary day?'),
    ).toBeTruthy();
    // The brand strip, "1 of 3" and the eyebrow are decoration: a screen reader skips them.
    expect(screen.queryByText('1 of 3')).toBeNull();
  });

  it('draws the same constellation for the same name, and a different one for another', () => {
    expect(figureFor('Quiet scoring')).toEqual(figureFor('Quiet scoring'));
    expect(figureFor('Quiet scoring')).not.toEqual(figureFor('Yes before thinking'));
    const { stars, lines } = figureFor('Quiet scoring');
    expect(stars).toHaveLength(7);
    for (const [from, to] of lines) {
      expect(stars[from]).toBeDefined();
      expect(stars[to]).toBeDefined();
    }
  });
});
