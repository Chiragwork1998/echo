import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { render } from '@/testing/render';

import { RiverPoint } from './RiverPoint';

const AT = { x: 100, y: 300 };

function point(props: Partial<Parameters<typeof RiverPoint>[0]> = {}) {
  return (
    <RiverPoint
      label="Hold onto moments"
      at={AT}
      screenWidth={393}
      selected={false}
      onSelect={jest.fn()}
      {...props}
    />
  );
}

describe('RiverPoint', () => {
  it('is a radio control named by its label', async () => {
    await render(point());
    expect(screen.getByRole('radio', { name: 'Hold onto moments' })).toBeTruthy();
  });

  it('exposes the selected state to assistive technology, and not by colour alone', async () => {
    await render(point({ selected: true }));
    const control = screen.getByRole('radio', { name: 'Hold onto moments' });
    expect(control).toBeSelected();
    expect(control).toBeChecked();
  });

  it('reports unselected when it is not chosen', async () => {
    await render(point());
    const control = screen.getByRole('radio', { name: 'Hold onto moments' });
    expect(control).not.toBeSelected();
    expect(control).not.toBeChecked();
  });

  it('calls onSelect when pressed', async () => {
    const onSelect = jest.fn();
    await render(point({ onSelect }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Hold onto moments' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('centres a 44 pt target on the marker and keeps the label inside it', async () => {
    await render(point());
    const control = screen.getByRole('radio', { name: 'Hold onto moments' });
    const style = StyleSheet.flatten(control.props.style);
    expect(style.height).toBe(44);
    expect(style.top).toBe(AT.y - 22);
    expect(style.left).toBe(AT.x - 22);
    expect(within(control).getByText('Hold onto moments')).toBeTruthy();
  });

  it('hides its decorative ring from screen readers', async () => {
    await render(point());
    const hidden: unknown[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const { props, children } = node as { props?: Record<string, unknown>; children?: unknown[] };
      if (props?.importantForAccessibility === 'no-hide-descendants') hidden.push(node);
      children?.forEach(walk);
    };
    walk(screen.toJSON());
    expect(hidden.length).toBeGreaterThan(0);
  });

  it('stays invisible until its label is measured, then appears', async () => {
    await render(point());
    const label = screen.getByText('Hold onto moments');
    const wrapper = label.parent!;
    expect(StyleSheet.flatten(wrapper.props.style).opacity).toBe(0);
    await act(async () => {
      fireEvent(label, 'layout', { nativeEvent: { layout: { width: 90, height: 20 } } });
    });
    expect(StyleSheet.flatten(wrapper.props.style).opacity).toBe(1);
  });
});
