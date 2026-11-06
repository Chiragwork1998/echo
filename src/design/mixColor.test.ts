import { mixColor, mixColors, parseColor } from './mixColor';
import { tokens } from './tokens';

describe('parseColor', () => {
  it('reads the forms the tokens use', () => {
    expect(parseColor('#13263A')).toEqual([0x13, 0x26, 0x3a, 1]);
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('rgba(11,25,42,0.54)')).toEqual([11, 25, 42, 0.54]);
    expect(parseColor('rgb(8, 88, 152)')).toEqual([8, 88, 152, 1]);
  });

  it('says so about anything else', () => {
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('linear-gradient(0deg, red, blue)')).toBeNull();
  });

  it('reads every colour in both themes', () => {
    for (const theme of Object.values(tokens.color)) {
      for (const value of Object.values(theme)) expect(parseColor(value)).not.toBeNull();
    }
  });
});

describe('mixColor', () => {
  it('is the first colour at 0 and the second at 1', () => {
    expect(parseColor(mixColor('#000000', '#FFFFFF', 0))).toEqual([0, 0, 0, 1]);
    expect(parseColor(mixColor('#000000', '#FFFFFF', 1))).toEqual([255, 255, 255, 1]);
  });

  it('is half way at 0.5, in colour and in opacity', () => {
    expect(parseColor(mixColor('#000000', '#FFFFFF', 0.5))).toEqual([128, 128, 128, 1]);
    expect(parseColor(mixColor('rgba(0,0,0,0.2)', 'rgba(0,0,0,0.6)', 0.5))).toEqual([0, 0, 0, 0.4]);
  });

  it('switches at the middle for a colour it cannot read, rather than guess', () => {
    expect(mixColor('transparent', '#FFFFFF', 0.4)).toBe('transparent');
    expect(mixColor('transparent', '#FFFFFF', 0.6)).toBe('#FFFFFF');
  });
});

describe('mixColors', () => {
  it('mixes every key, keeping the same keys', () => {
    const { day, night } = tokens.color;
    const half = mixColors(night, day, 0.5);
    expect(Object.keys(half)).toEqual(Object.keys(day));
    expect(parseColor(half.textInk)).toEqual([
      Math.round((0x0b + 0x13) / 2),
      Math.round((0x1d + 0x26) / 2),
      Math.round((0x35 + 0x3a) / 2),
      1,
    ]);
  });
});
