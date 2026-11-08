import { controlsBottom, keyboardRise, restingDrop, ROW_CLEARANCE } from './bookPlace';

const SCREEN = 800;
const BOOK = 340;
const CLEAR_TOP = 50;

describe('where the daily book rests', () => {
  const drop = restingDrop(SCREEN, CLEAR_TOP, BOOK);
  const top = CLEAR_TOP + drop;

  it('sits in the middle of the screen', () => {
    expect(top + BOOK / 2).toBe(SCREEN / 2);
  });

  it('never rests above its place clear of the keyboard', () => {
    expect(restingDrop(500, 50, 480)).toBe(0);
  });

  it('stays in the middle with no keyboard', () => {
    expect(keyboardRise(0, SCREEN, top + BOOK, drop)).toBe(0);
  });

  it('rises only as far as the keyboard needs', () => {
    const keyboard = SCREEN - (top + BOOK) - ROW_CLEARANCE + 30;
    expect(keyboardRise(keyboard, SCREEN, top + BOOK, drop)).toBe(30);
  });

  it('rises no further than the place clear of the keyboard', () => {
    expect(keyboardRise(700, SCREEN, top + BOOK, drop)).toBe(drop);
  });

  it('does not move at all when it has nowhere to go', () => {
    expect(keyboardRise(300, SCREEN, 390, 0)).toBe(0);
  });
});

describe('where the quiet row rides', () => {
  const RESTING = 60;
  const ABOVE = 16;

  it('stays where it rests until the keys would reach it', () => {
    expect(controlsBottom(0, RESTING, ABOVE)).toBe(RESTING);
    expect(controlsBottom(1, RESTING, ABOVE)).toBe(RESTING);
    expect(controlsBottom(44, RESTING, ABOVE)).toBe(RESTING);
  });

  it('then rides with them, one to one, a little above', () => {
    expect(controlsBottom(45, RESTING, ABOVE)).toBe(61);
    expect(controlsBottom(336, RESTING, ABOVE)).toBe(352);
  });

  it('never jumps, however fast the keyboard comes or goes', () => {
    for (let keys = 0; keys < 400; keys += 1) {
      const step = Math.abs(
        controlsBottom(keys + 1, RESTING, ABOVE) - controlsBottom(keys, RESTING, ABOVE),
      );
      expect(step).toBeLessThanOrEqual(1);
    }
  });
});
