// Consent that cannot be read is not consent. The sheet's facts scroll above two buttons that stay in
// view, so a fact is never behind them, and a person is told there is more to read: the scrollbar is
// always drawn, and the foot of the text fades while there is more below it.
import { fireEvent, screen, within } from '@testing-library/react-native';

import { render } from '@/testing/render';

import { sessionCopy } from './sessionCopy';
import { VoiceConsentSheet } from './VoiceConsentSheet';

const open = (kind: 'voice' | 'live') =>
  render(
    <VoiceConsentSheet
      visible
      kind={kind}
      onAllow={jest.fn()}
      onKeep={jest.fn()}
      onClose={jest.fn()}
    />,
  );

const scroll = () => screen.getByTestId('consent-scroll');
const more = () => screen.queryByTestId('consent-more');

/** What the phone reports once the sheet is laid out: the window, then the whole of the text. */
async function lay(window: number, content: number) {
  await fireEvent(scroll(), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: window } },
  });
  await fireEvent(scroll(), 'contentSizeChange', 300, content);
}
const scrollTo = (y: number) =>
  fireEvent.scroll(scroll(), { nativeEvent: { contentOffset: { x: 0, y } } });

describe.each([
  ['voice', sessionCopy.consent],
  ['live', sessionCopy.liveConsent],
] as const)('the %s consent sheet', (kind, words) => {
  it('keeps every fact and the note inside the scroll, and the two choices outside it', async () => {
    await open(kind);
    const inside = within(scroll());
    expect(inside.getByText(words.title)).toBeTruthy();
    for (const fact of words.facts) expect(inside.getByText(fact)).toBeTruthy();
    expect(inside.getByText(words.note)).toBeTruthy();
    expect(inside.queryByText(words.allow)).toBeNull();
    expect(screen.getByText(words.allow)).toBeTruthy();
    expect(screen.getByLabelText(words.keep)).toBeTruthy();
  });

  it('always draws the scrollbar, so a person can see there is more', async () => {
    await open(kind);
    expect(scroll().props.showsVerticalScrollIndicator).toBe(true);
    expect(scroll().props.persistentScrollbar).toBe(true);
  });

  it('fades the foot of the text while there is more below, and not at the end', async () => {
    await open(kind);
    await lay(300, 900);
    expect(more()).toBeTruthy();
    await scrollTo(300);
    expect(more()).toBeTruthy();
    await scrollTo(600);
    expect(more()).toBeNull();
  });

  it('shows no fade when everything fits', async () => {
    await open(kind);
    await lay(900, 600);
    expect(more()).toBeNull();
  });
});
