// app.json blocks the permissions that libraries bring in and ECHO never uses. A permission that a
// library needs at the moment it is created is not one of those, and blocking it ends the app on
// every launch: nothing in a development build shows it, because Expo Go declares its own.
import appJson from '../../app.json';

const blocked: string[] = appJson.expo.android.blockedPermissions ?? [];

describe('the Android permissions app.json blocks', () => {
  // expo-screen-capture is how ECHO marks the window secure while the lock is on. On Android 14 and
  // later its native module registers a screenshot callback the moment it is created, which is at
  // launch, and the system answers a missing DETECT_SCREEN_CAPTURE with a SecurityException. Seen on a
  // release build: the splash, then the launcher, on every cold start.
  it('leaves DETECT_SCREEN_CAPTURE alone, because expo-screen-capture asks for it when it starts', () => {
    expect(blocked).not.toContain('android.permission.DETECT_SCREEN_CAPTURE');
  });

  it('still blocks what ECHO never starts: overlay, shared storage, and the foreground service', () => {
    expect(blocked).toEqual(
      expect.arrayContaining([
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.FOREGROUND_SERVICE',
      ]),
    );
  });
});
