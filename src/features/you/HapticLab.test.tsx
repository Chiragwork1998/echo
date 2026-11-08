import { fireEvent, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { cue } from '@/design/haptics';
import { render } from '@/testing/render';

import { HapticLab } from './HapticLab';
import { YouScreen } from './YouScreen';

jest.mock('@/design/haptics');
jest.mock('./support', () => ({ ...jest.requireActual('./support'), APP_VERSION: '1.0.0' }));
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  usePathname: () => '/home/you',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/services/biometric', () => ({
  authenticate: jest.fn(),
  verifyLockAvailable: jest.fn(),
}));
jest.mock('@/services/permissions', () => ({
  getNotificationPermission: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  openAppSettings: jest.fn(),
}));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false }],
}));

const CUES = [
  'tick',
  'fine',
  'on',
  'off',
  'commit',
  'settle',
  'breathIn',
  'breathOut',
  'moment',
] as const;

beforeEach(() => {
  jest.clearAllMocks();
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
});

describe('the haptic lab', () => {
  it('has one button for each cue, and each plays its own', async () => {
    await render(<HapticLab visible onClose={jest.fn()} />);
    for (const name of CUES) {
      await fireEvent.press(screen.getByRole('button', { name }));
      expect(cue).toHaveBeenLastCalledWith(name);
    }
    expect(cue).toHaveBeenCalledTimes(CUES.length);
  });

  it('closes from its own button', async () => {
    const onClose = jest.fn();
    await render(<HapticLab visible onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays out of sight until it is asked for', async () => {
    await render(<HapticLab visible={false} onClose={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'tick' })).toBeNull();
  });
});

describe('opening the lab from You', () => {
  it('is hidden at first, and opens on a long press of the version line', async () => {
    await render(<YouScreen />);
    expect(screen.queryByTestId('haptic-lab')).toBeNull();
    await fireEvent(screen.getByText('Version 1.0.0'), 'longPress');
    expect(await screen.findByTestId('haptic-lab')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'tick' })).toBeTruthy();
  });

  it('does nothing for an ordinary press of the version line', async () => {
    await render(<YouScreen />);
    await fireEvent.press(screen.getByText('Version 1.0.0'));
    expect(screen.queryByTestId('haptic-lab')).toBeNull();
  });
});
