import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { specCopy } from './specCopy';

const spec = readFileSync(
  join(process.cwd(), 'product-handoff/specs/INTERACTIONS_AND_STATES.md'),
  'utf8',
);

// The spec writes the one string that carries a value with its example time, 9:30 PM.
const strings = Object.values(specCopy).map((value) =>
  typeof value === 'function' ? value('9:30 PM') : value,
);

describe('spec copy', () => {
  it.each(strings)('"%s" appears verbatim in INTERACTIONS_AND_STATES.md', (text) => {
    expect(spec).toContain(text);
  });

  it('puts the device time into the reminder toast, and nothing else', () => {
    expect(specCopy.reminderScheduled('21:30')).toBe('We’ll meet you at 21:30.');
  });
});
