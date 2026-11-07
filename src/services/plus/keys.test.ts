import { chooseKey, isTestKey } from './keys';

const android = 'goog_synthetic_android';
const ios = 'appl_synthetic_ios';
const test = 'test_synthetic_store';

describe('the RevenueCat key a build uses', () => {
  it('uses the platform key in a release build', () => {
    expect(chooseKey({ platform: 'android', dev: false, keys: { android, ios } })).toEqual({
      key: android,
      testStore: false,
    });
    expect(chooseKey({ platform: 'ios', dev: false, keys: { android, ios } })).toEqual({
      key: ios,
      testStore: false,
    });
  });

  it('has no billing without a key, which leaves every Plus feature open', () => {
    expect(chooseKey({ platform: 'android', dev: false, keys: {} })).toEqual({
      key: null,
      off: 'no_key',
    });
    expect(chooseKey({ platform: 'android', dev: true, keys: { ios } })).toEqual({
      key: null,
      off: 'no_key',
    });
  });

  it('prefers the Test Store in a development build', () => {
    expect(chooseKey({ platform: 'android', dev: true, keys: { android, test } })).toEqual({
      key: test,
      testStore: true,
    });
    expect(chooseKey({ platform: 'android', dev: true, keys: { android } })).toEqual({
      key: android,
      testStore: false,
    });
  });

  // RevenueCat's SDK alerts and then crashes a release build configured with a Test Store key.
  it('never gives a release build a test key, from either variable', () => {
    expect(chooseKey({ platform: 'android', dev: false, keys: { test } })).toEqual({
      key: null,
      off: 'test_key_in_release',
    });
    expect(chooseKey({ platform: 'android', dev: false, keys: { android, test } })).toEqual({
      key: android,
      testStore: false,
    });
    expect(chooseKey({ platform: 'android', dev: false, keys: { android: test } })).toEqual({
      key: null,
      off: 'test_key_in_release',
    });
    expect(chooseKey({ platform: 'ios', dev: false, keys: { ios: test } })).toEqual({
      key: null,
      off: 'test_key_in_release',
    });
  });

  it('allows a test key in a development build, wherever it was put', () => {
    expect(chooseKey({ platform: 'android', dev: true, keys: { android: test } })).toEqual({
      key: test,
      testStore: true,
    });
  });

  it('has no billing on web, where the harness stands in for the store', () => {
    expect(chooseKey({ platform: 'web', dev: true, keys: { android, ios, test } })).toEqual({
      key: null,
      off: 'unsupported_platform',
    });
  });

  it('knows a Test Store key by its prefix', () => {
    expect(isTestKey(test)).toBe(true);
    expect(isTestKey(android)).toBe(false);
    expect(isTestKey('goog_test_lookalike')).toBe(false);
  });
});
