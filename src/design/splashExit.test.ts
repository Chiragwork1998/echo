import * as SplashScreen from 'expo-splash-screen';

import { configureSplashExit } from './splashExit';
import { tokens } from './tokens';

jest.mock('expo-splash-screen', () => ({ setOptions: jest.fn() }));

const setOptions = jest.mocked(SplashScreen.setOptions);

beforeEach(() => setOptions.mockReset());

describe('the way the splash goes', () => {
  it('fades over the quickest of the app’s own motions on Android, not over 400 ms', () => {
    configureSplashExit('android');
    expect(setOptions).toHaveBeenCalledTimes(1);
    expect(setOptions).toHaveBeenCalledWith({ duration: tokens.motion.fast });
  });

  it('leaves iOS as it is', () => {
    configureSplashExit('ios');
    expect(setOptions).not.toHaveBeenCalled();
  });

  it('survives a build that has no such native function', () => {
    setOptions.mockImplementation(() => {
      throw new Error('setOptions is not a function');
    });
    expect(() => configureSplashExit('android')).not.toThrow();
  });
});
