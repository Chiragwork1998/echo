import { act, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { backgroundSources } from '@/design/generated/backgrounds';
import { resetPlateThumbsForTests, warmPlateThumbs } from '@/design/plateThumbs';
import { tokens } from '@/design/tokens';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { homeLabels } from './homeLabels';

import { CardSkeleton, PlateThumb } from './shared';

// The picture itself is not what is under test: how it arrives is.
jest.mock('expo-image', () => {
  const { View: Box } = jest.requireActual('react-native');
  // Nothing is decoded until a test says so: a screen that mounts first meets a picture that is late.
  const Image = Object.assign((props: object) => <Box testID="thumb" {...props} />, {
    loadAsync: jest.fn(() => new Promise(() => undefined)),
  });
  return { Image };
});

const loadAsync = jest.mocked(Image.loadAsync);
const decoded = (name: string) => ({ decoded: name }) as never;

beforeEach(() => {
  resetPlateThumbsForTests();
  loadAsync.mockClear();
  loadAsync.mockImplementation(() => new Promise(() => undefined));
});

type Node = { props?: { style?: unknown }; children?: (Node | string)[] };

/** Every style in a subtree, flattened, in order. */
function styles(node: Node): Record<string, unknown>[] {
  const own = StyleSheet.flatten(node.props?.style as never) as Record<string, unknown> | undefined;
  const below = (node.children ?? []).flatMap((child) =>
    typeof child === 'string' ? [] : styles(child),
  );
  return own ? [own, ...below] : below;
}

describe('the placeholder for the card that is coming', () => {
  // The wait itself belongs to the shared skeleton (src/features/tab-pages/Resolve.tsx, Bars) and is
  // tested there: Home's card uses the same one as Echoes, the entry page and Patterns.
  it('draws nothing at first, so a quick read leaves no card for a frame', async () => {
    await render(<CardSkeleton height={84} />);
    const card = screen.getByLabelText(homeLabels.loading, { includeHiddenElements: true });
    const fades = styles(card as unknown as Node).filter((style) => 'opacity' in style);
    expect(fades[0]?.opacity).toBe(0);
  });

  it('is announced as busy from the first moment, and keeps its footprint', async () => {
    await render(<CardSkeleton height={84} />);
    const card = screen.getByLabelText(homeLabels.loading, { includeHiddenElements: true });
    expect(card.props.accessibilityState).toEqual({ busy: true });
    expect(styles(card as unknown as Node)).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 84 })]),
    );
  });
});

describe('the thumbnail of the plate on Home’s card and avatar', () => {
  // The walk (F5): on the second welcome the card's thumbnail was empty for a frame and then popped in.
  // It is a crop of the plate at a size of its own, so it is decoded on its own and can be late. It
  // dissolves in when it is, and never pops.
  it('dissolves in when it is drawn late, over the glass it sits on', async () => {
    await render(<PlateThumb size={72} radius={12} />);
    const image = screen.getByTestId('thumb', { includeHiddenElements: true });
    expect(image.props.transition).toEqual({
      duration: tokens.motion.fast,
      effect: 'cross-dissolve',
    });
  });

  it('is a crop of the Home plate, in the theme that is on show', async () => {
    await render(<PlateThumb size={72} radius={12} />);
    const image = screen.getByTestId('thumb', { includeHiddenElements: true });
    // Whichever theme is on show, it is that theme's Home plate and no other picture.
    expect([backgroundSources.day.home, backgroundSources.night.home]).toContain(
      image.props.source,
    );
    expect(image.props.contentFit).toBe('fill');
  });
});

// The walk (v10): the card's thumbnail was empty for one frame and popped in, at the welcome and after
// every tab change; the header's avatar showed no fade. The plate is decoded ahead of time and kept
// (src/design/plateThumbs.ts), so a screen that comes back draws it whole in its first frame.
describe('the thumbnail when the plate has been decoded ahead of time', () => {
  const thumb = () => screen.getByTestId('thumb', { includeHiddenElements: true });

  beforeEach(async () => {
    await act(async () => usePreferences.setState({ theme: 'night' }));
  });

  it('draws the decoded picture in the very first frame, with no dissolve to wait through', async () => {
    const night = decoded('night');
    loadAsync.mockResolvedValue(night);
    await act(async () => warmPlateThumbs('night'));
    await render(<PlateThumb size={72} radius={12} />);
    expect(thumb().props.source).toBe(night);
    expect(thumb().props.transition).toBe(0);
  });

  it('draws it the same way each time the screen comes back, after a tab change', async () => {
    const night = decoded('night');
    loadAsync.mockResolvedValue(night);
    await act(async () => warmPlateThumbs('night'));
    const first = await render(<PlateThumb size={72} radius={12} />);
    await first.unmount();
    await render(<PlateThumb size={72} radius={12} />);
    expect(thumb().props.source).toBe(night);
    expect(thumb().props.transition).toBe(0);
  });

  it('takes the picture of the theme that is on show', async () => {
    loadAsync.mockImplementation(async (source) =>
      source === backgroundSources.day.home ? decoded('day') : decoded('night'),
    );
    await act(async () => warmPlateThumbs('night'));
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await render(<PlateThumb size={72} radius={12} />);
    expect(thumb().props.source).toEqual(decoded('day'));
  });

  it('keeps the crop it always had: the same place on the plate, at the same size', async () => {
    loadAsync.mockResolvedValue(decoded('night'));
    await act(async () => warmPlateThumbs('night'));
    await render(<PlateThumb size={72} radius={12} focus={{ x: 0, y: 0.24, width: 1 }} />);
    expect(thumb().props.contentFit).toBe('fill');
    const crop = StyleSheet.flatten(thumb().props.style as object) as Record<string, number>;
    expect(crop).toMatchObject({ position: 'absolute', width: 72 });
    expect(crop.left).toBeCloseTo(0);
    expect(crop.top).toBeCloseTo(-0.24 * 72 * (2796 / 1290));
  });

  it('swaps to the decoded picture without a second dissolve if it arrives once the screen is up', async () => {
    let finish: (image: never) => void = () => undefined;
    loadAsync.mockImplementation(() => new Promise((resolve) => (finish = resolve as never)));
    await render(<PlateThumb size={72} radius={12} />);
    // Late: the plate's own file, dissolving in over the glass, as before.
    expect(thumb().props.source).toBe(backgroundSources.night.home);
    expect(thumb().props.transition).toEqual({
      duration: tokens.motion.fast,
      effect: 'cross-dissolve',
    });
    const night = decoded('night');
    await act(async () => finish(night));
    expect(thumb().props.source).toBe(night);
    expect(thumb().props.transition).toBe(0);
  });
});
