import { render, screen } from '@testing-library/react-native';
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
