import { copy } from '@/content/copy';

/**
 * WORKING COPY. Everything You says that is not in the copy deck. Not locked: the owner approves or
 * replaces it when the designs arrive. `statement` is the wellness-software line the brief asked for
 * in plain words, and it needs the owner's (and legal's) final wording before release.
 */
export const youCopy = {
  title: copy.home.tabs[3],

  appearance: 'Appearance',
  day: 'Day',
  night: 'Night',
  automatic: 'Automatic',
  automaticDetail: 'Follows your phone',

  reminder: 'Reminder',
  reminderSwitch: copy.rhythm.reminder,
  reminderTime: 'Reminder time',
  reminderTimeHint: 'Opens the time picker',
  reminderSaving: 'Saving your reminder',
  reminderBlocked: 'Notifications are off for ECHO, so no reminder will arrive.',
  openSettings: 'Open Settings',

  privacy: 'Privacy',
  lockUnavailable: 'Set up a passcode or biometrics on this phone first. The lock stays off.',
  lockFailed: 'The lock couldn’t be confirmed, so it stays off.',
  lockChecking: 'Checking the lock',

  // Needs the owner's approval. The facts themselves are said in the question that turning it on shows.
  voiceWords: 'Turn my voice into words',
  voiceWordsRow: 'Your voice',
  voiceWordsDetail:
    'Off: recordings stay on this phone and are never sent. On: they go to OpenAI to become text. Turning it on shows exactly what happens first.',

  notAvailable: 'Not available yet',
  backup: 'Private backup',
  backupDetail: 'Not available yet. Your journal is kept only on this phone.',
  ai: 'AI reflection',
  aiDetail: 'Not available yet. ECHO doesn’t send your words anywhere to reflect on them.',

  data: 'Your data',
  export: 'Export your journal',
  exportDetail: 'Entries and recordings in one file, shared the way you choose',
  exporting: 'Preparing your export',
  exported: (count: number) =>
    count === 1 ? 'Prepared 1 echo for sharing.' : `Prepared ${count} echoes for sharing.`,
  exportSkipped: (count: number) =>
    count === 1
      ? '1 echo can’t be opened, so it was left out.'
      : `${count} echoes can’t be opened, so they were left out.`,
  exportUnavailable: 'Sharing isn’t available on this device.',
  exportFailed: 'The export didn’t finish. Your journal is unchanged.',

  deleteAll: 'Delete all data',
  deleteAllDetail: 'Removes everything ECHO keeps on this phone',
  deleting: 'Deleting',
  deleteFirstTitle: 'Delete all data?',
  deleteFirstBody:
    'Every echo, recording and setting is removed from this phone. This can’t be undone.',
  deleteContinue: 'Continue',
  deleteCancel: 'Cancel',
  deleteFinalTitle: 'This can’t be undone',
  deleteFinalBody:
    'Everything ECHO keeps on this phone will be gone for good, and ECHO will start again from the beginning.',
  deleteConfirm: 'Delete everything',
  deleteFailed: 'Some data couldn’t be removed. Nothing else has changed. Try again.',

  support: 'Support',
  supportAction: 'Email support',
  supportDetail: 'Opens your email app. No echoes are attached.',
  supportSubject: 'ECHO support',
  supportFailed: (address: string) => `No email app was found. You can write to ${address}.`,

  about: 'About',
  version: (version: string) => `Version ${version}`,
  statement: 'ECHO is wellness software. It is not therapy, diagnosis, or emergency care.',
} as const;
