import { patternsCopy } from './patternsCopy';

describe('what Pattern cards say they read', () => {
  it('does not say only words that were written are used, because words that were spoken and became text are used too', () => {
    const intro = patternsCopy.cards.intro;
    expect(intro).not.toMatch(/words you wrote/i);
    expect(intro).toMatch(
      /Only the words in your entries are used, whether you wrote or spoke them/,
    );
    expect(intro).toMatch(/each quote is checked against them/);
  });
});
