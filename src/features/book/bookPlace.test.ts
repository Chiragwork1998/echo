import { keyboardRise, restingDrop, ROW_CLEARANCE } from './bookPlace';

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
