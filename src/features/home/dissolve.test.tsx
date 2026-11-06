import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { render } from '@/testing/render';

import { DISSOLVE_MS, HomeDissolveProvider, useHomeDissolve, useSessionEntry } from './dissolve';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  usePathname: () => '/home',
}));

function Probe() {
  const control = useHomeDissolve();
  const { begin, speakInstead, continueDraft } = useSessionEntry();
  return (
    <>
      <Text testID="phase">{control.phase}</Text>
      <Pressable testID="begin" onPress={begin} />
      <Pressable testID="speak" onPress={speakInstead} />
      <Pressable testID="continue" onPress={() => continueDraft('d1')} />
      <Pressable testID="opened" onPress={control.sessionOpened} />
      <Pressable testID="closed" onPress={control.sessionClosed} />
    </>
  );
}
const phase = () => screen.getByTestId('phase').props.children;
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const open = () =>
  render(
    <HomeDissolveProvider>
      <Probe />
    </HomeDissolveProvider>,
  );

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('the dissolve into the daily session', () => {
  it('melts Home first, and only then opens the session', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    expect(phase()).toBe('leaving');
    await tick(DISSOLVE_MS - 1);
    expect(router.push).not.toHaveBeenCalled();
    await tick(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/home/session');
  });

  it('hands the status bar over once most of Home is gone', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS * 0.5);
    expect(phase()).toBe('gone');
  });

  it('carries Speak and Continue into the session the same way', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('speak'));
    await tick(DISSOLVE_MS);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'voice' },
    });
    // The session closes, Home returns, and Continue is open to use again.
    await fireEvent.press(screen.getByTestId('opened'));
    await fireEvent.press(screen.getByTestId('closed'));
    await tick(1000);
    expect(phase()).toBe('idle');
    await fireEvent.press(screen.getByTestId('continue'));
    await tick(DISSOLVE_MS);
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/home/session',
      params: { draftId: 'd1' },
    });
  });

  it('ignores a second press while it is dissolving', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('gives Home back when the session closes', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS);
    await fireEvent.press(screen.getByTestId('opened'));
    await tick(5000);
    expect(phase()).toBe('gone');
    await fireEvent.press(screen.getByTestId('closed'));
    await tick(1000);
    expect(phase()).toBe('idle');
  });

  it('never leaves Home empty if the session does not appear', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('begin'));
    await tick(DISSOLVE_MS + 2500);
    expect(phase()).toBe('idle');
  });
});

describe('without a provider', () => {
  it('simply navigates', async () => {
    await render(<Probe />);
    await fireEvent.press(screen.getByTestId('begin'));
    expect(router.push).toHaveBeenCalledWith('/home/session');
  });
});
