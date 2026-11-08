// The block of earlier leaves at the spine: what it is made of, and when the newest leaf is let in.
import { screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/design/theme';
import { render } from '@/testing/render';

import { hairlines, LeftStack } from './LeftStack';
import { usePaperLook } from './paper';
import { FULL, SHORT } from './ritual';
import { LEAF_PITCH, leafGeometry } from './standing';
import type { ClosingState } from './useBookClosing';

jest.mock(
  'react-native-reanimated',
  () => jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
);

const closing = (patch: Partial<ClosingState> = {}): ClosingState => ({
  ritual: FULL,
  hurry: false,
  contact: false,
  sinking: false,
  reduced: false,
  asking: false,
  ...patch,
});

function Stack(props: {
  echoes: number;
  room?: number;
  keeping?: boolean;
  closing?: ClosingState | null;
}) {
  const look = usePaperLook('vellum');
  return (
    <LeftStack
      echoes={props.echoes}
      room={props.room ?? 20}
      look={look}
      keeping={props.keeping}
      closing={props.closing ?? null}
    />
  );
}
const wrap = (ui: React.ReactElement) => <ThemeProvider crossfade={false}>{ui}</ThemeProvider>;
const block = () => screen.queryByTestId('book-left-stack', { includeHiddenElements: true });
const newest = () =>
  screen.queryByTestId('book-left-stack-newest', { includeHiddenElements: true });
const width = () =>
  (block()?.props.style as { width: number }[]).flat().find((s) => s?.width)?.width;

describe('the hairlines', () => {
  it('are a point and a half apart, nearest the page first, in three tones', () => {
    const [a, b, dark] = hairlines(0, 4, 6);
    // Four leaves in six points: the first is next to the page, at the right of the picture.
    expect(a).toBe('M5.25 0V100M2.25 0V100');
    expect(b).toBe('M3.75 0V100');
    // Every fourth is a little darker.
    expect(dark).toBe('M0.75 0V100');
    expect(LEAF_PITCH).toBe(1.5);
  });

  it('draw nothing where there are none to draw', () => {
    expect(hairlines(0, 0, 0)).toEqual(['', '', '']);
  });
});

describe('the block of earlier leaves', () => {
  it('is there in an empty book, thin, and thicker in a book that has been written in', async () => {
    const view = await render(<Stack echoes={0} />);
    const thin = width();
    expect(thin).toBe(leafGeometry(0, 20).leaves * LEAF_PITCH);
    await view.rerender(wrap(<Stack echoes={100} />));
    expect(width()).toBeGreaterThan(thin!);
  });

  it('is not there where the page has no room beside it', async () => {
    await render(<Stack echoes={50} room={4} />);
    expect(block()).toBeNull();
  });

  it('is a picture and nothing a screen reader should read', async () => {
    await render(<Stack echoes={10} />);
    expect(block()?.props.accessibilityElementsHidden).toBe(true);
  });
});

describe('the newest leaf', () => {
  // Echoes 4 and 5 are either side of a hairline: the third comes with the fifth.
  const before = 4;
  const after = 5;
  /** The entry is being kept, then it is kept and counted, and then the closing begins. */
  const keep = async (
    view: Awaited<ReturnType<typeof render>>,
    patch: Partial<ClosingState> = {},
  ) => {
    await view.rerender(wrap(<Stack echoes={before} keeping />));
    await view.rerender(wrap(<Stack echoes={after} keeping />));
    await view.rerender(wrap(<Stack echoes={after} closing={closing(patch)} />));
  };

  it('is let in as the cover lands, not before, when the entry adds a leaf', async () => {
    expect(leafGeometry(after, 20).leaves).toBe(leafGeometry(before, 20).leaves + 1);
    const view = await render(<Stack echoes={before} />);
    const held = width();
    await keep(view);
    // Counted already, and not yet shown.
    expect(width()).toBe(held);
    expect(newest()).toBeNull();
    await view.rerender(
      wrap(<Stack echoes={after} keeping closing={closing({ contact: true })} />),
    );
    expect(newest()).toBeTruthy();
    expect(width()).toBe(leafGeometry(after, 20).leaves * LEAF_PITCH);
  });

  it('holds the count the page was opened with, though the new one comes with the closing', async () => {
    // A quick save: the entry is kept, counted and the book begins to shut before anything is drawn.
    const view = await render(<Stack echoes={before} />);
    const held = width();
    await view.rerender(wrap(<Stack echoes={after} closing={closing()} />));
    expect(width()).toBe(held);
    expect(newest()).toBeNull();
    await view.rerender(wrap(<Stack echoes={after} closing={closing({ contact: true })} />));
    expect(newest()).toBeTruthy();
  });

  it('is not a slide when the entry does not add a leaf: the block is as it was', async () => {
    expect(leafGeometry(1, 20).leaves).toBe(leafGeometry(0, 20).leaves);
    const view = await render(<Stack echoes={0} />);
    await view.rerender(wrap(<Stack echoes={0} keeping />));
    await view.rerender(wrap(<Stack echoes={1} closing={closing({ contact: true })} />));
    expect(newest()).toBeNull();
  });

  it('lets go of what it held if the entry could not be kept', async () => {
    const view = await render(<Stack echoes={before} />);
    await view.rerender(wrap(<Stack echoes={before} keeping />));
    await view.rerender(wrap(<Stack echoes={after} />));
    expect(width()).toBe(leafGeometry(after, 20).leaves * LEAF_PITCH);
    expect(newest()).toBeNull();
  });

  it('is simply there when a tap hurried the closing, and under Reduce Motion', async () => {
    for (const patch of [{ hurry: true }, { reduced: true }]) {
      const view = await render(<Stack echoes={before} />);
      await keep(view, { ...patch, contact: true });
      expect(newest()).toBeNull();
      expect(width()).toBe(leafGeometry(after, 20).leaves * LEAF_PITCH);
      await view.unmount();
    }
  });

  it('is let in at the practised book\u2019s own, shorter pace', async () => {
    const view = await render(<Stack echoes={before} />);
    await keep(view, { ritual: SHORT, contact: true });
    expect(newest()).toBeTruthy();
  });
});
