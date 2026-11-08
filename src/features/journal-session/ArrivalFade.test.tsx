// Spoken words land softly onto an empty page, and plainly over words that are already readable.
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { withTiming } from 'react-native-reanimated';

import { ThemeProvider } from '@/design/theme';
import { render } from '@/testing/render';

import { ArrivalFade } from './ArrivalFade';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
  withTiming: jest.fn((value: unknown) => value),
}));
let mockReduced = false;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));

const fade = (arrival: number, filled: boolean) => (
  <ArrivalFade arrival={arrival} filled={filled} style={{}}>
    <Text>words</Text>
  </ArrivalFade>
);

// A rerender replaces the whole tree, so the providers go back around it.
const wrap = (ui: React.ReactElement) => <ThemeProvider crossfade={false}>{ui}</ThemeProvider>;
const rendered = async (ui: React.ReactElement) => {
  const view = await render(ui);
  return { rerender: (next: React.ReactElement) => view.rerender(wrap(next)) };
};

beforeEach(() => {
  mockReduced = false;
  jest.mocked(withTiming).mockClear();
});

describe('words landing', () => {
  it('settle in from a fifth onto a page that was empty', async () => {
    const { rerender } = await rendered(fade(0, false));
    await rerender(fade(1, true));
    expect(jest.mocked(withTiming)).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ duration: 900 }),
    );
  });

  it('do not dip over words the person was already reading', async () => {
    const { rerender } = await rendered(fade(0, true));
    await rerender(fade(1, true));
    expect(jest.mocked(withTiming)).not.toHaveBeenCalled();
    expect(screen.getByText('words')).toBeTruthy();
  });

  it('never dip under Reduce Motion', async () => {
    mockReduced = true;
    const { rerender } = await rendered(fade(0, false));
    await rerender(fade(1, true));
    expect(jest.mocked(withTiming)).not.toHaveBeenCalled();
  });

  it('keep the dormant path as it was when nothing says the page is filled', async () => {
    const { rerender } = await rendered(
      <ArrivalFade arrival={0} style={{}}>
        <Text>words</Text>
      </ArrivalFade>,
    );
    await rerender(
      <ArrivalFade arrival={1} style={{}}>
        <Text>words</Text>
      </ArrivalFade>,
    );
    expect(jest.mocked(withTiming)).toHaveBeenCalled();
  });
});
