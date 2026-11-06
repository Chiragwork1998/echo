import { useWindowDimensions } from 'react-native';

import { OnboardingHeading } from '@/components/OnboardingHeading';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';

// The golden's title is set a little smaller, and sits a little lower, than the other steps'.
const TITLE_TOP = 35.5;
const TITLE = { fontSize: 33.1, lineHeight: 40.2 };
const TITLE_WIDTH = 312; // the title's width at that size, with a little to spare
const MIN_FIT = 0.8;
// The golden breaks the subtitle after "when", on two balanced lines, where OnboardingHeading would
// run it the full width.
const SUBTITLE_LINE = 38;

/** The text with a line break before the word that would pass `max` characters. */
export function breakLines(text: string, max: number): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  return [...lines, line].join('\n');
}

const SUBTITLE = breakLines(copy.rhythm.subtitle, SUBTITLE_LINE);

export function RhythmHeading() {
  const { gutter, width: column, accessibleLayout } = useLayout();
  const { fontScale } = useWindowDimensions();
  // One line, as in the golden: a narrow phone or larger text sets it a little smaller. At 125% and
  // above the scrolling layout lets it wrap instead.
  const fit = accessibleLayout
    ? 1
    : Math.max(MIN_FIT, Math.min(1, (column - gutter * 2) / (TITLE_WIDTH * fontScale)));
  const title = { fontSize: TITLE.fontSize * fit, lineHeight: TITLE.lineHeight * fit };
  return (
    <OnboardingHeading
      title={copy.rhythm.title}
      subtitle={SUBTITLE}
      titleStyle={title}
      top={TITLE_TOP}
    />
  );
}
