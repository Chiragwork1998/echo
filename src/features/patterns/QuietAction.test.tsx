import { act, fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { mostFadedGlass } from '@/testing/glass';
import { render } from '@/testing/render';

import { QuietAction } from './QuietAction';

/** The opacity of the nearest ancestor of some words that has one set. */
function fadeOf(text: string): number {
  let node = screen.getByText(text).parent;
  while (node) {
    const opacity = (StyleSheet.flatten(node.props.style) as { opacity?: number } | undefined)
      ?.opacity;
    if (opacity !== undefined && opacity !== 1) return opacity;
    node = node.parent;
  }
  return 1;
}

describe('QuietAction', () => {
  it('keeps its glass whole while it is pressed: only its label dims', async () => {
    // Android loses a BlurView's blur under any ancestor that is see-through, so a pill that dimmed
    // as a whole went pale as it was touched.
    await render(<QuietAction label="Read again" onPress={() => undefined} />);
    expect(mostFadedGlass()).toBe(1);
    // A finger goes down on it and stays.
    await act(() => {
      fireEvent(screen.getByRole('button', { name: 'Read again' }), 'responderGrant', {
        persist: () => undefined,
        currentTarget: 1,
        nativeEvent: { touches: [], changedTouches: [], identifier: 1, timestamp: 0 },
      });
    });
    expect(fadeOf('Read again')).toBeCloseTo(0.72);
    expect(mostFadedGlass()).toBe(1);
  });

  it('still says what it does, and does it', async () => {
    const onPress = jest.fn();
    await render(<QuietAction label="Read again" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Read again' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
