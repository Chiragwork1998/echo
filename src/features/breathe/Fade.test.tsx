import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { render } from '@/testing/render';

import { Fade } from './Fade';

let mockReduced = false;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));

beforeEach(() => {
  jest.restoreAllMocks();
  mockReduced = false;
});

const timings = (spy: jest.SpyInstance) =>
  spy.mock.calls.map(([to, options]) => ({
    to,
    duration: (options as { duration: number }).duration,
  }));

describe('Fade', () => {
  it('comes up over 520 ms, and goes out over 320', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    const view = await render(
      <Fade testID="fade">
        <Text>a made-up line</Text>
      </Fade>,
    );
    expect(screen.getByText('a made-up line')).toBeTruthy();
    await view.rerender(
      <Fade testID="fade" visible={false}>
        <Text>a made-up line</Text>
      </Fade>,
    );
    expect(timings(spy)).toEqual([
      { to: 1, duration: 520 },
      { to: 0, duration: 320 },
    ]);
  });

  it('takes the lengths it is given', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await render(<Fade inMs={320} />);
    expect(timings(spy)).toEqual([{ to: 1, duration: 320 }]);
  });

  it('starts from nothing: it is never there whole on its first frame', async () => {
    await render(<Fade testID="fade" />);
    expect(screen.getByTestId('fade').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0 })]),
    );
  });

  it('under Reduce Motion, is a plain fade of 180 ms either way', async () => {
    mockReduced = true;
    const spy = jest.spyOn(Reanimated, 'withTiming');
    const view = await render(<Fade />);
    await view.rerender(<Fade visible={false} />);
    expect(timings(spy)).toEqual([
      { to: 1, duration: 180 },
      { to: 0, duration: 180 },
    ]);
  });
});
