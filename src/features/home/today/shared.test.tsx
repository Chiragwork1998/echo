import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { render } from '@/testing/render';

import { homeLabels } from './homeLabels';
import { backgroundSources } from '@/design/generated/backgrounds';
import { tokens } from '@/design/tokens';

import { CardSkeleton, PlateThumb } from './shared';

// The picture itself is not what is under test: how it arrives is.
jest.mock('expo-image', () => {
  const { View: Box } = jest.requireActual('react-native');
  return { Image: (props: object) => <Box testID="thumb" {...props} /> };
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
