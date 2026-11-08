import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { useReduceMotion } from '@/design/useReduceMotion';
import { reanimatedMock } from '@/testing/reanimatedMock';

import { Reveal } from './Reveal';

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;
const timing = jest.spyOn(reanimatedMock, 'withTiming');
const durations = () =>
  timing.mock.calls.map((call) => ((call as unknown[])[1] as { duration: number }).duration);

beforeEach(() => {
  reduced.mockReturnValue(false);
  timing.mockClear();
});

describe('Reveal', () => {
  it('renders its children', async () => {
    await render(
      <Reveal>
        <Text>A card</Text>
      </Reveal>,
    );
    expect(screen.getByText('A card')).toBeTruthy();
  });

  it('takes 560 ms for a card, or the duration it is given', async () => {
    const view = await render(
      <Reveal>
        <Text>A card</Text>
      </Reveal>,
    );
    expect(durations()).toEqual([560]);
    timing.mockClear();
    await view.unmount();
    await render(
      <Reveal duration={320}>
        <Text>A panel</Text>
      </Reveal>,
    );
    expect(durations()).toEqual([320]);
  });

  it('under Reduce Motion is 180 ms of opacity, whatever the duration, with no rise', async () => {
    reduced.mockReturnValue(true);
    await render(
      <Reveal>
        <Text>A card</Text>
      </Reveal>,
    );
    expect(durations()).toEqual([180]);
    const style = StyleSheet.flatten(screen.getByText('A card').parent?.props.style) as {
      transform: { translateY: number }[];
    };
    expect(style.transform).toEqual([{ translateY: 0 }]);
  });
});

describe('Reveal that waits to be laid out', () => {
  // Mounting a heavy card takes a frame or more, and an animation timed from the commit has spent
  // that time before a single frame of the card is drawn: it is shown already part of the way in,
  // and reads as a pop (the walk, c2). So it starts once the card has been laid out.
  const placed = () =>
    fireEvent(screen.getByText('A card'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 340, height: 520 } },
    });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not begin until it has been laid out, and then begins at once', async () => {
    const view = await render(
      <Reveal afterLayout>
        <Text>A card</Text>
      </Reveal>,
    );
    expect(timing).not.toHaveBeenCalled();
    await act(() => {
      placed();
    });
    expect(durations()).toEqual([560]);
    await view.unmount();
  });

  it('is not drawn before then: it is nothing, not already half there', async () => {
    const view = await render(
      <Reveal afterLayout>
        <Text>A card</Text>
      </Reveal>,
    );
    const style = StyleSheet.flatten(screen.getByText('A card').parent?.props.style) as {
      opacity: number;
    };
    expect(style.opacity).toBe(0);
    await view.unmount();
  });

  it('begins anyway if no layout is ever reported, a quarter of a second on', async () => {
    const view = await render(
      <Reveal afterLayout>
        <Text>A card</Text>
      </Reveal>,
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(249);
    });
    expect(timing).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(durations()).toEqual([560]);
    await view.unmount();
  });

  it('begins once, however many times it is laid out', async () => {
    const view = await render(
      <Reveal afterLayout>
        <Text>A card</Text>
      </Reveal>,
    );
    await act(() => {
      placed();
      placed();
    });
    expect(durations()).toEqual([560]);
    await view.unmount();
  });

  it('a Reveal that does not ask to wait begins at mount, as it always did', async () => {
    const view = await render(
      <Reveal>
        <Text>A card</Text>
      </Reveal>,
    );
    expect(durations()).toEqual([560]);
    await view.unmount();
  });
});
