import { fireEvent, screen } from '@testing-library/react-native';

import type { PatternCard } from '@/services/patterns';
import { render } from '@/testing/render';

import { PatternCardView } from './PatternCardView';
import { patternsCopy } from './patternsCopy';

const card: PatternCard = {
  name: 'Guilty about resting',
  noticed:
    'It seems that rest brings a little guilt with it. You might notice it arrives on schedule.',
  evidence: [
    { quote: 'It is strange to feel guilty about resting', date: '2026-10-24' },
    { quote: 'the guilt arrive on schedule', date: '2026-11-04' },
  ],
  lens: {
    id: 'dispenza_loop',
    text: 'One way to see this is as a loop.',
    source: 'Joe Dispenza · thoughts and feelings in a loop',
  },
  practice: 'Write two short lines.',
  question: 'What does enough mean on an ordinary day?',
};

describe('PatternCardView', () => {
  it('sets the card first, its name and a line in the person’s words, then its reading in order', async () => {
    const { toJSON } = await render(<PatternCardView card={card} index={1} total={3} />);
    // The last two words of a paragraph are tied with a no-break space, so no word sits alone.
    const text = JSON.stringify(toJSON()).replace(/ /g, ' ');
    // Each part is found after the one before it: the card's face, then the reading beneath.
    let from = -1;
    const order = [
      'Guilty about resting',
      '“It is strange to feel guilty about resting”',
      'It seems that rest brings',
      'It is strange to feel guilty about resting',
      'One way to see this is as a loop.',
      'Idea from Joe Dispenza',
      'Write two short lines.',
      'What does enough mean on an ordinary day?',
    ].map((part) => (from = text.indexOf(part, from + 1)));
    expect(order.every((at) => at >= 0)).toBe(true);
  });

  it('shows a card already seen face up, with its reading', async () => {
    await render(<PatternCardView card={card} index={1} total={3} />);
    expect(
      screen.getByRole('header', { name: 'Pattern card 1 of 3: Guilty about resting' }),
    ).toBeTruthy();
    expect(screen.getByText(/It seems that rest brings/)).toBeTruthy();
  });

  it('brings a new card face down, and shows its reading once it is turned over', async () => {
    await render(<PatternCardView card={card} index={2} total={3} fresh />);
    expect(screen.queryByText(/It seems that rest brings/)).toBeNull();
    expect(screen.getByText(patternsCopy.cards.turnHint)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Pattern card 2 of 3, face down.' }));
    expect(await screen.findByText(/It seems that rest brings/)).toBeTruthy();
    expect(screen.queryByText(patternsCopy.cards.turnHint)).toBeNull();
    expect(
      screen.getByRole('header', { name: 'Pattern card 2 of 3: Guilty about resting' }),
    ).toBeTruthy();
  });

  it('names the card as a heading that says where it sits in the set', async () => {
    await render(<PatternCardView card={card} index={2} total={3} />);
    expect(
      screen.getByRole('header', { name: 'Pattern card 2 of 3: Guilty about resting' }),
    ).toBeTruthy();
  });

  it('speaks each part with its name, though the page shows no labels above them', async () => {
    const { toJSON } = await render(<PatternCardView card={card} index={1} total={3} />);
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
    // No ornament, and no stacked capitals: the type carries the card.
    const shown = JSON.stringify(toJSON());
    expect(shown).not.toMatch(/[✦✧★]/);
    for (const label of ['IN YOUR WORDS', 'A WAY TO SEE IT', 'ASK YOURSELF', 'THE PATTERN']) {
      expect(shown).not.toContain(label);
    }
  });

  it('sets the person’s words as quotations, each with its day', async () => {
    const { toJSON } = await render(<PatternCardView card={card} index={1} total={1} />);
    const text = JSON.stringify(toJSON()).replace(/ /g, ' ');
    expect(text).toContain('It is strange to feel guilty about resting”');
    expect(text).toContain('“');
  });

  it('offers a quiet report on every card', async () => {
    const onReport = jest.fn();
    await render(<PatternCardView card={card} index={1} total={1} onReport={onReport} />);
    await fireEvent.press(
      screen.getByRole('button', { name: patternsCopy.report.actionSpoken(card.name) }),
    );
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('says a card was reported, in place of offering it again', async () => {
    await render(<PatternCardView card={card} index={1} total={1} onReport={jest.fn()} reported />);
    expect(screen.queryByRole('button', { name: /Report this card/ })).toBeNull();
    expect(screen.getByText(patternsCopy.report.reported)).toBeTruthy();
  });

  it('offers no report where nothing can receive one', async () => {
    await render(<PatternCardView card={card} index={1} total={1} />);
    expect(screen.queryByRole('button', { name: /Report this card/ })).toBeNull();
  });
});
