// Putting the keys away before something is raised over the page, so that the page's own window runs
// their going (the walk, v11: keys that vanished under "Keep your draft?" were never seen to go).
import { act } from '@testing-library/react-native';
import { DeviceEventEmitter, Keyboard } from 'react-native';

import { afterTheKeys, KEYS_AWAY_CAP_MS } from './afterTheKeys';

let dismiss: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
});
afterEach(() => {
  // React Native's own record of the keys outlives a test: it is told they went.
  say('keyboardDidHide');
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const say = (event: 'keyboardDidShow' | 'keyboardDidHide') =>
  act(() => {
    DeviceEventEmitter.emit(event, { endCoordinates: { height: 300, screenY: 500 } });
  });

describe('after the keys', () => {
  it('runs at once when no keyboard is up, and touches nothing', () => {
    const then = jest.fn();
    expect(afterTheKeys(then)).toBeNull();
    expect(then).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('lets the keys go, and runs once they say they have gone', () => {
    say('keyboardDidShow');
    const then = jest.fn();
    expect(afterTheKeys(then)).not.toBeNull();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(then).not.toHaveBeenCalled();
    say('keyboardDidHide');
    expect(then).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(KEYS_AWAY_CAP_MS * 2);
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('runs anyway when the keys never say they have gone', () => {
    say('keyboardDidShow');
    const then = jest.fn();
    afterTheKeys(then);
    jest.advanceTimersByTime(KEYS_AWAY_CAP_MS - 1);
    expect(then).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(then).toHaveBeenCalledTimes(1);
    say('keyboardDidHide');
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('runs nothing once called off', () => {
    say('keyboardDidShow');
    const then = jest.fn();
    afterTheKeys(then)?.();
    say('keyboardDidHide');
    jest.advanceTimersByTime(KEYS_AWAY_CAP_MS * 2);
    expect(then).not.toHaveBeenCalled();
  });
});
