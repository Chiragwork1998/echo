import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { copy } from './copy';

const deck = readFileSync(join(process.cwd(), 'product-handoff/specs/COPY_DECK.md'), 'utf8');

const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : typeof value === 'object' && value !== null
        ? Object.values(value).flatMap(strings)
        : [];

describe('locked copy', () => {
  it.each(strings(copy))('"%s" appears verbatim in the copy deck', (text) => {
    expect(deck).toContain(text);
  });
});
