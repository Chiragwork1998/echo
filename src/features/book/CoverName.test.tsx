// The name on the cover: where it goes, the blank line that waits for it, and how long its stamp takes.
// How it looks is judged frame by frame. Invented names only.
import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { render } from '@/testing/render';

import { BookCover, NAME_PLACE } from './CoverArt';
import { nameType, stampMs } from './InscribedName';
import { VOLUMES } from './volumes';

jest.mock(
  'react-native-reanimated',
  () => jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
);

const volume = VOLUMES[5]!;
const WIDTH = 345;
const s = WIDTH / 150;
const cover = (props: Partial<Parameters<typeof BookCover>[0]> = {}) => (
  <BookCover height={400} index={5} volume={volume} width={WIDTH} {...props} />
);
const all = { includeHiddenElements: true } as const;
const lifted = () =>
  StyleSheet.flatten(screen.getByTestId('book-cover-title', all).props.style as never) as
    { transform?: { translateY: number }[] } | undefined;

describe('the name on the cover', () => {
  it('is not there on a book with no name, and the title stays where it always was', async () => {
    await render(cover());
    expect(screen.queryByTestId('book-cover-name', all)).toBeNull();
    expect(lifted()?.transform?.[0]?.translateY ?? 0).toBeCloseTo(0, 5);
  });

  it('is in the cover’s foot, in its foil, and the title has risen a little to make room', async () => {
    await render(cover({ name: 'Ottilie Brand' }));
    expect(screen.getByTestId('book-cover-name', all)).toBeTruthy();
    const colours = screen
      .getAllByText('Ottilie Brand', all)
      .map((text) => StyleSheet.flatten(text.props.style as never) as { color?: string })
      .map((style) => style.color);
    expect(colours).toContain(volume.foil);
    expect(lifted()?.transform?.[0]?.translateY).toBeCloseTo(-NAME_PLACE.lift * s, 5);
  });

  it('waits on a blank line while the book asks, and never under Reduce Motion', async () => {
    const view = await render(cover({ inscribing: { phase: 'ask' } }));
    expect(screen.getByTestId('book-name-line', all)).toBeTruthy();
    await view.rerender(
      <ThemeProvider crossfade={false}>
        {cover({ inscribing: { phase: 'ask' }, still: true })}
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('book-name-line', all)).toBeNull();
  });

  it('is stamped from what was written, while the book is asking', async () => {
    await render(cover({ inscribing: { phase: 'stamp', name: 'Ottilie Brand' } }));
    expect(screen.getByTestId('book-cover-name', all)).toBeTruthy();
  });
});

describe('the stamp', () => {
  it('takes a little longer for a longer name, within 600 and 900 ms', () => {
    expect(stampMs('Al')).toBe(650);
    expect(stampMs('')).toBe(600);
    expect(stampMs('Abcdefghijklmnopqrstuvwx')).toBe(900);
    expect(stampMs('Ottilie')).toBe(775);
  });

  it('is the serif italic for Latin letters, and the system serif, upright, for other scripts', () => {
    expect(nameType('Renée')).toEqual({ fontFamily: 'CormorantGaramond_400Regular_Italic' });
    expect(nameType('आरव')).toMatchObject({ fontStyle: 'normal' });
    expect(nameType('आरव').fontFamily).not.toMatch(/Cormorant/);
  });
});
