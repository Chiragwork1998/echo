import { joinSpoken, joinSpokenPieces, MIN_RUN } from './joinWords';

const join = (first: string, second: string) => joinSpoken({ text: first }, { text: second }).text;

describe('joining pieces that overlap', () => {
  it('keeps the shared run once', () => {
    expect(
      join(
        'I went down to the river and I sat down by the water',
        'sat down by the water and I watched it for a long time',
      ),
    ).toBe('I went down to the river and I sat down by the water and I watched it for a long time');
  });

  it('ignores case, punctuation and apostrophes when comparing, and keeps the first text as written', () => {
    expect(
      join(
        'Well, I told her. She said nothing, at all.',
        'she said: "nothing at all". And then she left.',
      ),
    ).toBe('Well, I told her. She said: "nothing at all". And then she left.');
    // A curly apostrophe and a straight one are the same letters. The second piece carries on from the
    // run's second word.
    expect(join('and I didn’t know what to say', "I didn't know what to say, honestly")).toBe(
      "and I didn't know what to say, honestly",
    );
  });

  it('needs at least three words, and says so', () => {
    expect(MIN_RUN).toBe(3);
    // Two words in common is not a confident match: nothing is dropped.
    expect(join('it was the end of the day', 'of the road ahead was long')).toBe(
      'it was the end of the day of the road ahead was long',
    );
  });

  it('joins with a space and loses nothing when there is no overlap at all', () => {
    expect(
      join(
        'We talked for hours about nothing in particular.',
        'The next morning the house felt strangely empty.',
      ),
    ).toBe(
      'We talked for hours about nothing in particular. The next morning the house felt strangely empty.',
    );
  });

  it('does not believe a run that is far from the cut', () => {
    // "I don't know" is in both, but nowhere near where the pieces meet.
    const first =
      "I don't know what any of this means anymore but the rain keeps falling on the roof tonight";
    const second = "tonight was quiet and I don't know why I stayed up so late";
    expect(join(first, second)).toBe(`${first} ${second}`);
  });

  it('drops a word cut in half at either edge, and keeps the whole word from the other side', () => {
    expect(
      join(
        'then she picked up the old photograph and stared at the wi',
        'ld photograph and stared at the window for a long time',
      ),
    ).toBe('then she picked up the old photograph and stared at the window for a long time');
  });

  it('still joins when a word in the middle of the overlap was heard differently', () => {
    expect(
      join(
        'walked past the old bakery and then turned lift onto the main road',
        'walked past the old bakery and then turned left onto the main road toward home',
      ),
    ).toBe('walked past the old bakery and then turned left onto the main road toward home');
  });

  it('keeps the first text capital where the second piece started a sentence it did not', () => {
    // A recogniser capitalises the first word it hears, even when the speech was mid-sentence.
    expect(join('and so I sat down by the water', 'Sat down by the water and I wept')).toBe(
      'and so I sat down by the water and I wept',
    );
    expect(
      join('and so I sat down by the water', 'Sat down by the water and I wept'),
    ).not.toContain('Sat');
  });

  it('tolerates a second piece that begins with filler the first did not hear', () => {
    expect(
      join(
        'and that is when I knew that it was over between us',
        'um that is when I knew that it was over between us and nothing else mattered',
      ),
    ).toBe('and that is when I knew that it was over between us and nothing else mattered');
  });

  it('says a word twice before it loses one: two clean words in the overlap are not enough', () => {
    // The ends of both pieces were heard badly, leaving two words in common.
    expect(join('and then we walked down zz zz', 'walked down to the bakery then home')).toBe(
      'and then we walked down zz zz walked down to the bakery then home',
    );
  });

  it('joins pieces of nothing, or of one side, without a stray space', () => {
    expect(join('', 'Only this.')).toBe('Only this.');
    expect(join('Only this.', '   ')).toBe('Only this.');
    expect(join('a b', 'c d')).toBe('a b c d');
    expect(joinSpokenPieces([])).toBe('');
    expect(joinSpokenPieces([{ text: 'Alone.' }])).toBe('Alone.');
  });
});

describe('repeated phrases', () => {
  it('prefers the longest run, so a phrase said twice is not collapsed into one', () => {
    expect(
      join(
        "So yeah, I don't know, I don't know what to say about it",
        "I don't know what to say about it, really. Anyway",
      ),
    ).toBe("So yeah, I don't know, I don't know what to say about it, really. Anyway");
  });

  it('keeps both repeats when the second piece begins with only the last of them', () => {
    // Two matches of three words are equally long. The one that throws fewer words away is the one at
    // the cut.
    expect(
      join(
        "and I said it twice, I don't know, I don't know",
        "I don't know. What should I do now?",
      ),
    ).toBe("and I said it twice, I don't know, I don't know. What should I do now?");
  });

  it('does not collapse a phrase someone said three times when the cut falls inside it', () => {
    const lead =
      'After the call I walked out to the back garden and stood there for a while thinking about what she said and then I started to say it over and over';
    const tail =
      'and after that I could not say anything else and I went back inside and sat down by the window';
    const truth = `${lead} I did not mean it I did not mean it I did not mean it ${tail}`;
    // The first piece ends after the second of them. The second began nine words before that.
    const words = truth.split(' ');
    const first = words.slice(0, 41).join(' ');
    const second = words.slice(32).join(' ');
    expect(join(first, second)).toBe(truth);
  });

  it('keeps every repeat of a refrain said three times, wherever the pieces are cut', () => {
    const lead =
      'After the call I walked out to the back garden and stood there for a while thinking about what she said and then I started to say it over and over';
    const tail =
      'and after that I could not say anything else and I went back inside and sat down by the window';
    const leadWords = lead.split(' ').length;
    let cuts = 0;
    for (const refrain of [
      'please stay with me',
      'I did not mean it',
      'it will be fine now',
      'I am so tired of this',
    ]) {
      const length = refrain.split(' ').length;
      const truth = `${lead} ${refrain} ${refrain} ${refrain} ${tail}`;
      const words = truth.split(' ');
      // Every place the first piece can end from the first repeat to just past the last, and every
      // overlap of nine to fourteen words, which is about what five seconds holds.
      for (let end = leadWords + length; end <= leadWords + length * 3 + 3; end += 1) {
        for (let overlap = 9; overlap <= 14; overlap += 1) {
          const first = words.slice(0, end).join(' ');
          const second = words.slice(end - overlap).join(' ');
          expect(join(first, second)).toBe(truth);
          cuts += 1;
        }
      }
    }
    expect(cuts).toBeGreaterThan(300);
  });

  it('removes a whole repeated phrase once when it is all in the overlap', () => {
    expect(join("yaar I don't know, I don't know", "I don't know, I don't know what to do")).toBe(
      "yaar I don't know, I don't know what to do",
    );
  });

  it('does not lose a repeated word that is not at the cut', () => {
    expect(
      join(
        'no no no no no no I really cannot see how this ends',
        'cannot see how this ends and I am afraid of it',
      ),
    ).toBe('no no no no no no I really cannot see how this ends and I am afraid of it');
  });
});

describe('Hindi and Roman text', () => {
  it('joins Devanagari, where the danda is not a word and vowel signs are part of one', () => {
    expect(
      join(
        'मैंने उससे कहा कि मुझे अब कुछ नहीं चाहिए। फिर मैं चुप हो गया और खिड़की से बाहर देखता रहा',
        'चुप हो गया और खिड़की से बाहर देखता रहा। बारिश हो रही थी',
      ),
    ).toBe(
      'मैंने उससे कहा कि मुझे अब कुछ नहीं चाहिए। फिर मैं चुप हो गया और खिड़की से बाहर देखता रहा। बारिश हो रही थी',
    );
  });

  it('does not take Hindi words for the same when only their vowel signs differ', () => {
    const first = 'मेरा घर दूर है';
    const second = 'मीरा घार दुर है';
    expect(join(first, second)).toBe(`${first} ${second}`);
  });

  it('joins Roman Hindi mixed with English', () => {
    expect(
      join(
        'yaar mujhe nahi pata kya karna hai, bas thak gaya hoon',
        'kya karna hai bas thak gaya hoon aur neend bhi nahi aa rahi',
      ),
    ).toBe('yaar mujhe nahi pata kya karna hai bas thak gaya hoon aur neend bhi nahi aa rahi');
  });

  it('looks for the overlap in the Devanagari when the Roman spelling drifts between pieces', () => {
    const first = {
      text: 'yaar mujhey nahin pataa kyaa karnaa hai',
      heard: 'यार मुझे नहीं पता क्या करना है',
    };
    const second = {
      text: 'mujhe nahi pata kya karna hai bas thak gaya',
      heard: 'मुझे नहीं पता क्या करना है बस थक गया',
    };
    // Looked for in the Roman text alone, one word in common is not an overlap, and the words are said twice.
    expect(joinSpoken({ text: first.text }, { text: second.text }).text).toBe(
      `${first.text} ${second.text}`,
    );
    const joined = joinSpoken(first, second);
    expect(joined.text).toBe('yaar mujhey nahi pata kya karna hai bas thak gaya');
    expect(joined.heard).toBe('यार मुझे नहीं पता क्या करना है बस थक गया');
  });

  it('falls back to the text when the Devanagari does not have the same number of words', () => {
    const first = { text: 'one two three four five', heard: 'x y' };
    const second = { text: 'three four five six seven', heard: 'x y z' };
    expect(joinSpoken(first, second)).toEqual({
      text: 'one two three four five six seven',
      heard: undefined,
    });
  });

  it('carries the Devanagari along when there is no overlap', () => {
    const joined = joinSpoken(
      { text: 'aaj bahut thaka hoon', heard: 'आज बहुत थका हूँ' },
      { text: 'kal milte hain', heard: 'कल मिलते हैं' },
    );
    expect(joined).toEqual({
      text: 'aaj bahut thaka hoon kal milte hain',
      heard: 'आज बहुत थका हूँ कल मिलते हैं',
    });
  });
});

describe('several pieces', () => {
  it('joins them in order, each to the one before it', () => {
    expect(
      joinSpokenPieces([
        { text: 'one two three four five six' },
        { text: 'four five six seven eight nine' },
        { text: 'seven eight nine ten eleven twelve' },
      ]),
    ).toBe('one two three four five six seven eight nine ten eleven twelve');
  });

  it('does not let a piece that is all overlap duplicate anything', () => {
    expect(
      joinSpokenPieces([
        { text: 'we sat on the roof until the lights came on' },
        { text: 'the roof until the lights came on' },
        { text: 'the lights came on across the whole city' },
      ]),
    ).toBe('we sat on the roof until the lights came on across the whole city');
  });
});

// A made-up story of words that are each said once, with a few phrases said again and again, is cut
// into pieces that overlap by eight to twelve words (three seconds of speech), and joined. The faults are the ones a recogniser has
// at the edge of a piece: the first or last word or two heard wrongly, or not at all.
describe('a take cut into many pieces', () => {
  const rng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const phrases = [
    ['i', "don't", 'know'],
    ['and', 'then', 'she', 'left'],
    ['no', 'no', 'no'],
  ];

  function story(random: () => number, length: number) {
    const words: string[] = [];
    let next = 0;
    while (words.length < length) {
      if (random() < 0.05) words.push(...phrases[Math.floor(random() * phrases.length)]!);
      else words.push(`w${(next += 1)}x`);
    }
    return words;
  }

  function trial(seed: number, faults: boolean) {
    const random = rng(seed);
    const words = story(random, 500);
    const pieces: string[] = [];
    let from = 0;
    for (;;) {
      const to = Math.min(words.length, from + 55 + Math.floor(random() * 50));
      let piece = words.slice(from, to);
      if (faults && from > 0) {
        const edge = 1 + Math.floor(random() * 2);
        const style = random();
        // Half a word, a different word, or nothing at all.
        piece =
          style < 0.4
            ? [...piece.slice(0, edge).map((w) => `${w.slice(0, 2)}~`), ...piece.slice(edge)]
            : style < 0.7
              ? [...piece.slice(0, edge).map(() => 'zz'), ...piece.slice(edge)]
              : piece.slice(edge);
      }
      if (faults && to < words.length) {
        const edge = 1 + Math.floor(random() * 2);
        const style = random();
        const kept = piece.slice(0, -edge);
        piece =
          style < 0.4
            ? [...kept, ...piece.slice(-edge).map((w) => `${w.slice(0, 2)}~`)]
            : style < 0.7
              ? [...kept, ...piece.slice(-edge).map(() => 'zz')]
              : kept;
      }
      pieces.push(piece.join(' '));
      if (to === words.length) break;
      from = to - (8 + Math.floor(random() * 5));
    }
    const joined = joinSpokenPieces(pieces.map((text) => ({ text }))).split(' ');
    return { words, joined };
  }

  const count = (list: string[], word: string) => list.filter((w) => w === word).length;
  const once = (words: string[]) => words.filter((w) => /^w\d+x$/.test(w));

  it('says every word once when the pieces are clean', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const { words, joined } = trial(seed, false);
      expect(joined).toEqual(words);
    }
  });

  it('loses no word when the edges of the pieces are heard badly, and says few twice', () => {
    let lost = 0;
    let doubled = 0;
    let wrong = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const { words, joined } = trial(seed, true);
      for (const word of once(words)) {
        const times = count(joined, word);
        if (times === 0) lost += 1;
        if (times > 1) doubled += 1;
      }
      // A word that was heard wrongly at the cut and kept is a wrong word, not a missing one.
      wrong += joined.filter((w) => w === 'zz' || w.endsWith('~')).length;
    }
    expect(lost).toBe(0);
    expect(doubled).toBe(0);
    // Out of about 2,000 cuts.
    expect(wrong).toBeLessThan(20);
  });
});
