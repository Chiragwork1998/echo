import { sameWords, words } from './words';

// The server keeps the same measure (voice-api/src/format.ts), and these are its own cases, from
// voice-api/src/format.test.ts: a change to one side's cases is a change to the other's. Every text
// here is invented.

describe('words', () => {
  it('reads case, punctuation, curly quotes and whitespace as no part of a word', () => {
    expect(words('Um,  I don’t know…\n\n“Enough”?')).toEqual([
      'um',
      'i',
      "don't",
      'know',
      'enough',
    ]);
    // Every curly apostrophe is the straight one.
    expect(words("don’t don‘t donʼt don't")).toEqual(["don't", "don't", "don't", "don't"]);
    expect(sameWords('i dont know what enough means', 'I dont know what "enough" means.')).toBe(
      true,
    );
    expect(sameWords('“I’m fine,” I said', '"I\'m fine," I said.')).toBe(true);
    expect(sameWords('so tired', 'So.\n\nTired!')).toBe(true);
  });

  it('keeps an apostrophe or a hyphen inside a word, and nowhere else', () => {
    expect(words("'quoted' rock'n'roll o'clock")).toEqual(['quoted', "rock'n'roll", "o'clock"]);
    expect(words('well-known self-doubt')).toEqual(['well-known', 'self-doubt']);
    expect(words('tired - really -- tired x- -y well--known')).toEqual([
      'tired',
      'really',
      'tired',
      'x',
      'y',
      'well',
      'known',
    ]);
    // A dash between words is punctuation; the same mark inside a word is not.
    expect(sameWords('tired - really tired', 'Tired — really tired.')).toBe(true);
  });

  it('reads Hindi and Hinglish as words like any other, with a vowel sign part of its word', () => {
    expect(words('yaar, mujhe nahi pata!')).toEqual(['yaar', 'mujhe', 'nahi', 'pata']);
    expect(words('आज मेरा मन भारी है।')).toEqual(['आज', 'मेरा', 'मन', 'भारी', 'है']);
    // Dropping the vowel sign of मेरा changes the word.
    expect(sameWords('मेरा मन', 'मरा मन')).toBe(false);
  });

  it('reads numbers as words, and the punctuation between their digits as none', () => {
    expect(words('Slept 3.5 hours, woke at 6:30.')).toEqual([
      'slept',
      '3',
      '5',
      'hours',
      'woke',
      'at',
      '6',
      '30',
    ]);
    expect(sameWords('woke at 6 30', 'Woke at 6:30.')).toBe(true);
    expect(sameWords('slept 3 hours', 'Slept three hours.')).toBe(false);
    expect(sameWords('it cost 1500', 'It cost 1,500.')).toBe(false);
  });

  it('reads a letter with an accent as one letter, written either way (NFC)', () => {
    expect(words('Café Über')).toEqual(['café', 'über']);
    expect(sameWords('café au lait', 'Café au lait.')).toBe(true);
    expect(sameWords('cafe au lait', 'Café au lait.')).toBe(false);
  });
});

describe('sameWords', () => {
  it('finds any change to a word a different text, however small', () => {
    for (const [before, after] of [
      ['i can not sleep', 'I cannot sleep.'],
      ['i cannot sleep', 'I can not sleep.'],
      ['i am gonna try', 'I am going to try.'],
      ['i dont know', "I don't know."],
      ['so so tired', 'So tired.'],
      ['tired', ''],
    ]) {
      expect([after, sameWords(before!, after!)]).toEqual([after, false]);
    }
    expect(sameWords('', '')).toBe(true);
  });

  // The server's cases of a model's version that changes a word, every one of which falls back to
  // the person's own text there, and is refused by the journal here.
  it.each([
    [
      'drops a word',
      'um so i walked to the river and i sat there',
      'So I walked to the river, and I sat there.',
    ],
    [
      'adds a word',
      'um so i walked to the river and i sat there',
      'Um, so I walked to the river, and then I sat there.',
    ],
    [
      'reorders',
      'um so i walked to the river and i sat there',
      'Um, so I walked to the river, and there I sat.',
    ],
    [
      'merges "can not"',
      'i can not sleep and i dont know why',
      'I cannot sleep, and I dont know why.',
    ],
    [
      'splits "cannot"',
      'i cannot sleep and i dont know why',
      'I can not sleep, and I dont know why.',
    ],
    ['changes "gonna"', 'i am gonna be fine i think', 'I am going to be fine, I think.'],
    ['changes "wanna"', 'i just wanna sleep for a week', 'I just want to sleep for a week.'],
    [
      'adds an apostrophe',
      'i dont know why i keep doing this',
      "I don't know why I keep doing this.",
    ],
    ['opens a curly contraction', 'I’m tired of being tired', 'I am tired of being tired.'],
    ['respells Hinglish', 'yaar mujhe nahi pata kya karun', 'Yaar, mujhe nahin pata kya karoon.'],
    ['translates Hinglish', 'yaar mujhe nahi pata kya karun', "Yaar, I don't know what to do."],
    ['romanises Devanagari', 'आज मेरा मन भारी है yaar', 'Aaj mera mann bhaari hai, yaar.'],
    ['writes a number in words', 'i slept 3 hours last night', 'I slept three hours last night.'],
    ['writes a word as a number', 'i slept three hours last night', 'I slept 3 hours last night.'],
    ['regroups a number', 'the rent went up to 15000 again', 'The rent went up to 15,000 again.'],
    ['drops a number', 'i woke at 4 and again at 6', 'I woke at 4, and again.'],
    [
      'joins words with a hyphen',
      'that well known feeling again',
      'That well-known feeling again.',
    ],
    ['drops a hyphen', 'the old self-doubt again today', 'The old self doubt again today.'],
    [
      'turns a hyphen into a dash',
      'the old self-doubt again today',
      'The old self—doubt again today.',
    ],
    ['removes a filler', 'i mean i like really miss her', 'I mean, I really miss her.'],
    ['removes a repetition', 'i i think i am okay', 'I think I am okay.'],
    ['corrects spelling', 'i walked alot today by the sea', 'I walked a lot today by the sea.'],
    ['summarises', 'um so i walked to the river and i sat there', 'I walked to the river.'],
    [
      'adds a preamble',
      'um so i walked to the river and i sat there',
      'Here it is:\n\nUm, so I walked to the river, and I sat there.',
    ],
  ])('refuses a version that %s', (_what, before, after) => {
    expect(sameWords(before, after)).toBe(false);
  });

  it('holds for a version set out with only punctuation, capitals and whitespace', () => {
    expect(
      sameWords(
        'so um today was long i woke up at 6 30 and i was like i cant do this again and then i went for a walk by the river and it was fine actually it was good',
        'So, um, today was long. I woke up at 6:30, and I was like, "I cant do this again."\n\nAnd then I went for a walk by the river, and it was fine. Actually, it was good.',
      ),
    ).toBe(true);
    // Curly or straight, quotes and apostrophes are the same words either way.
    expect(
      sameWords(
        'i don’t know what “enough” means anymore',
        'I don\'t know what "enough" means anymore.',
      ),
    ).toBe(true);
  });
});
