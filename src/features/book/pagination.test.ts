import { linesOf, measuredText, pageCount, pageOfLine } from './pagination';

describe('pagination', () => {
  it('counts lines from a measured height, with one line to write on when there is nothing', () => {
    expect(linesOf(0, 32)).toBe(1);
    expect(linesOf(96, 32)).toBe(3);
    expect(linesOf(95.4, 32)).toBe(3);
  });

  it('keeps a line to write on after a newline', () => {
    expect(measuredText('a\n')).toBe('a\n ');
    expect(measuredText('a')).toBe('a');
  });

  it('counts pages, with lines held back for a heading on the first', () => {
    expect(pageCount(4, 0, 4)).toBe(1);
    expect(pageCount(5, 0, 4)).toBe(2);
    expect(pageCount(3, 2, 4)).toBe(2);
    expect(pageCount(0, 0, 4)).toBe(1);
  });

  it('puts each line on exactly one page, in order, so a turn can only change the view', () => {
    const per = 4;
    const lead = 2;
    const lines = 11;
    const pages = pageCount(lines, lead, per);
    const seen = Array.from({ length: lines }, (_, line) => pageOfLine(line, lead, per));
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(Math.max(...seen)).toBe(pages - 1);
    expect(pageOfLine(1, lead, per)).toBe(0);
    expect(pageOfLine(2, lead, per)).toBe(1);
    expect(pageOfLine(-1, lead, per)).toBe(0);
  });
});
