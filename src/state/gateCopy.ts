// Text for the root gate's own states. The copy deck has none, so this is working text, not locked
// copy, and it needs owner approval before moving to src/content. It stays plain and factual, and
// never mentions anything a user wrote.
export const gateCopy = {
  keyLost: {
    title: 'We can’t open your journal here.',
    body: 'Your entries are still on this device, encrypted. The key that opens them is missing. Nothing has been changed.',
    retry: 'Try again',
    startOver: 'Start over',
    confirmTitle: 'Erase everything?',
    confirmBody: 'Your encrypted entries will be deleted from this device. This can’t be undone.',
    confirmErase: 'Erase',
    confirmCancel: 'Cancel',
  },
  storage: {
    secure_store: {
      title: 'ECHO can’t open yet.',
      body: 'Unlock your device, then try again.',
    },
    database: {
      title: 'Something stopped ECHO from opening.',
      body: 'Your journal hasn’t been changed.',
    },
    database_too_new: {
      title: 'This version of ECHO is out of date.',
      body: 'Update the app to open your journal.',
    },
    retry: 'Try again',
  },
  lock: {
    title: 'Your journal is locked.',
    biometric: 'Use your face, fingerprint, or device passcode.',
    passcode: 'Use your device passcode.',
    none: 'This device no longer has a passcode or biometrics, so the lock can’t be used.',
    failed: 'That didn’t work. Try again.',
    lockout: 'Too many attempts. Try your device passcode.',
    unlock: 'Unlock',
    disable: 'Turn off lock',
  },
} as const;
