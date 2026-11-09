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

// One reading agreement (D-017). It is a promise, so each line has to be literally true of what the
// app does, wherever it is asked: in Patterns before a reading, and on Completion's saved card.
describe('what the reading agreement says it covers', () => {
  const { consent, choices } = patternsCopy;

  it('names all three things it lets ECHO read entries for', () => {
    expect(consent.lead).toMatch(/today’s echo/);
    expect(consent.lead).toMatch(
      /setting out what you write or say in paragraphs with every word kept/,
    );
    expect(consent.lead).toMatch(/pattern cards/);
    expect(consent.lead).toMatch(/separate from voice/);
  });

  it('no longer says it is asked once, here, because it is asked in two places', () => {
    expect(consent.lead).not.toMatch(/asked once, here/);
    expect(consent.facts.join(' ')).not.toMatch(/here in Patterns/);
    expect(consent.facts).toContain('You can withdraw this at any time, in Patterns.');
  });

  it('says what comes back is kept on the phone, not the cards alone', () => {
    expect(consent.facts).toContain('What comes back is kept on this phone, encrypted.');
    expect(consent.facts.join(' ')).not.toMatch(/The cards are kept/);
  });

  it('says on Completion what it would send there', () => {
    expect(consent.sendsKept).toBe(
      'ECHO will send the entry you’ve just kept, and each one after it.',
    );
  });

  it('says that withdrawing stops all three', () => {
    expect(choices.withdrawDetail).toMatch(
      /^Today’s echo, setting out what you write or say, and pattern cards all stop\./,
    );
  });
});
