// How an entry is laid out on pages. The entry is one string and always stays one string: a page is
// only a window of `per` lines over the same text, so no word can be lost, split or reordered by
// turning a page. `lead` lines at the top of the first page belong to a heading, not to the text.

/** What the page measures the text with: a newline at the end still leaves a line to write on. */
export const measuredText = (value: string) => (value.endsWith('\n') ? `${value} ` : value);

/** The number of lines in a measured height. Nothing is still one line, the one to write on. */
export const linesOf = (height: number, line: number) =>
  Math.max(1, Math.round(height / Math.max(1, line)));

/** The page a line of text falls on. */
export const pageOfLine = (line: number, lead: number, per: number) =>
  Math.floor((Math.max(0, line) + lead) / Math.max(1, per));

export const pageCount = (lines: number, lead: number, per: number) =>
  Math.max(1, Math.ceil((Math.max(1, lines) + lead) / Math.max(1, per)));
