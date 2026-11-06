import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications';

import {
  getMicrophonePermission,
  getNotificationPermission,
  requestMicrophonePermission,
  requestNotificationPermission,
} from './permissions';

jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

const granted = { status: 'granted', canAskAgain: true } as never;
const denied = { status: 'denied', canAskAgain: false } as never;

beforeEach(() => jest.clearAllMocks());

describe('reading permission state', () => {
  it('never shows a prompt', async () => {
    jest.mocked(getRecordingPermissionsAsync).mockResolvedValue(granted);
    jest.mocked(getPermissionsAsync).mockResolvedValue(granted);
    await getMicrophonePermission();
    await getNotificationPermission();
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('distinguishes a denial that only Settings can undo', async () => {
    jest.mocked(getRecordingPermissionsAsync).mockResolvedValue(denied);
    expect(await getMicrophonePermission()).toEqual({ status: 'denied', canAskAgain: false });
  });
});

describe('requesting permission', () => {
  it('asks for exactly the permission named', async () => {
    jest.mocked(requestRecordingPermissionsAsync).mockResolvedValue(granted);
    expect(await requestMicrophonePermission()).toEqual({ status: 'granted', canAskAgain: true });
    expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does the same for notifications', async () => {
    jest.mocked(requestPermissionsAsync).mockResolvedValue(granted);
    expect((await requestNotificationPermission()).status).toBe('granted');
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports a native failure as undetermined rather than throwing', async () => {
    jest.mocked(requestPermissionsAsync).mockRejectedValue(new Error('native'));
    expect(await requestNotificationPermission()).toEqual({
      status: 'undetermined',
      canAskAgain: false,
    });
  });
});
