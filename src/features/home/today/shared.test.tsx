import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { render } from '@/testing/render';

import { homeLabels } from './homeLabels';
import { CardSkeleton } from './shared';

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
