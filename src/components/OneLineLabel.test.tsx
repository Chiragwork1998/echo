import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { render } from '@/testing/render';

import { OneLineLabel } from './OneLineLabel';

describe('OneLineLabel', () => {
  it('shows one line with room to spare, so no word can drop out of sight', async () => {
    await render(<OneLineLabel variant="bodyM">Write instead</OneLineLabel>);
    const shown = screen.getByText('Write instead');
    expect(shown.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(shown.props.style).textAlign).toBe('center');
    const room = StyleSheet.flatten(shown.parent?.props.style);
    expect(room.position).toBe('absolute');
    expect(room.left).toBeLessThan(0);
    expect(room.right).toBeLessThan(0);
  });

  it('keeps its copy for sizing hidden, so a screen reader hears the label once', async () => {
    await render(<OneLineLabel variant="bodyM">Write instead</OneLineLabel>);
    expect(screen.getAllByText('Write instead')).toHaveLength(1);
    const both = screen.getAllByText('Write instead', { includeHiddenElements: true });
    expect(both).toHaveLength(2);
    const sizer = both.find((node) => node.props.numberOfLines === undefined);
    expect(sizer?.props.accessibilityElementsHidden).toBe(true);
    expect(sizer?.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(StyleSheet.flatten(sizer?.props.style).opacity).toBe(0);
  });

  it('wears the same type on both copies, so the size it sets is the size it shows', async () => {
    await render(
      <OneLineLabel variant="bodyM" style={{ fontSize: 11.5 }}>
        Write instead
      </OneLineLabel>,
    );
    const both = screen.getAllByText('Write instead', { includeHiddenElements: true });
    expect(both.map((node) => StyleSheet.flatten(node.props.style).fontSize)).toEqual([11.5, 11.5]);
  });
});
