import { screen, waitFor } from '@testing-library/react-native';

import { createMemoryJournal, setJournal, useVoiceRecorder } from '@/features/journal';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { DailySessionScreen } from './DailySessionScreen';
import { sessionCopy } from './sessionCopy';

let mockParams: Record<string, string | undefined> = {};

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { navigate: jest.fn() },
    Stack: { Screen: () => null },
    usePathname: () => '/home/session',
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
  useAnimatedKeyboard: () => ({ height: { get: () => 0 }, state: { get: () => 0 } }),
}));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useVoiceRecorder: jest.fn(),
}));
jest.mock('@/services/permissions', () => ({
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));

beforeEach(() => {
  mockParams = {};
  setJournal(createMemoryJournal({ entries: [] }));
  jest.mocked(useVoiceRecorder).mockImplementation(
    () =>
      ({
        available: true,
        state: 'idle',
        elapsedSeconds: 0,
        error: null,
        start: jest.fn(async () => null),
        stop: jest.fn(),
        cancel: jest.fn(),
      }) as never,
  );
});
afterEach(() => {
  setJournal(null);
  usePreferences.setState({ lastMode: 'speak' });
});

const speaking = () => screen.queryByRole('button', { name: sessionCopy.speak.record });

describe('the daily session route', () => {
  it('opens in Speak by default, and in the mode last chosen after that', async () => {
    usePreferences.setState({ lastMode: 'speak' });
    await render(<DailySessionScreen />);
    await waitFor(() => expect(speaking()).toBeTruthy());
  });

  it('opens in Write when that was the last choice', async () => {
    usePreferences.setState({ lastMode: 'write' });
    await render(<DailySessionScreen />);
    await waitFor(() => expect(screen.getByTestId('session-scenery')).toBeTruthy());
    expect(speaking()).toBeNull();
  });

  it.each(['voice', 'speak'])(
    'mode=%s opens in Speak, even for someone who last wrote',
    async (mode) => {
      usePreferences.setState({ lastMode: 'write' });
      mockParams = { mode };
      await render(<DailySessionScreen />);
      await waitFor(() => expect(speaking()).toBeTruthy());
      // An explicit route does not change what is remembered.
      expect(usePreferences.getState().lastMode).toBe('write');
    },
  );

  it('mode=write opens in Write, even for someone who last spoke', async () => {
    usePreferences.setState({ lastMode: 'speak' });
    mockParams = { mode: 'write' };
    await render(<DailySessionScreen />);
    await waitFor(() => expect(screen.getByTestId('session-scenery')).toBeTruthy());
    expect(speaking()).toBeNull();
    expect(usePreferences.getState().lastMode).toBe('speak');
  });

  it('ignores a mode it does not know', async () => {
    usePreferences.setState({ lastMode: 'speak' });
    mockParams = { mode: 'poem' };
    await render(<DailySessionScreen />);
    await waitFor(() => expect(speaking()).toBeTruthy());
  });
});
