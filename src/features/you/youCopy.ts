import { copy } from '@/content/copy';
import { supportCopy } from '@/features/patterns/supportResources';
import { SYNTHETIC_VOICE_NOTE } from '@/features/breathe/library';

/**
 * WORKING COPY. Everything You says that is not in the copy deck. Not locked: the owner approves or
 * replaces it on device. `statement` is the wellness-software line the brief asked for in plain
 * words, and it needs the owner's (and legal's) final wording before release.
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

  // The name on the book (src/features/book/bookCopy.ts asks for it once). Working copy, waiting on
  // the owner, like the book's own.
  bookName: 'Name on your book',
  bookNameNone: 'Not written',
  bookNameHint: 'Write, change or remove the name on your book',
  bookNameRemove: 'Remove my name',
  bookNameRemoveTitle: 'Take your name off the book?',
  bookNameRemoveBody: 'It comes off the cover and the page. You can write it again at any time.',
  bookNameCancel: 'Cancel',
  bookNameFailed: 'Your name couldn’t be kept. Try again.',

  privacy: 'Privacy',
  lockUnavailable: 'Set up a passcode or biometrics on this phone first. The lock stays off.',
  lockFailed: 'The lock couldn’t be confirmed, so it stays off.',
  lockChecking: 'Checking the lock',

  // Needs the owner's approval. The facts themselves are said in the question that turning it on shows.
  voiceWords: 'Turn my voice into words',
  voiceWordsDetail:
    'Off: recordings stay on this phone and are never sent. On: your voice goes to OpenAI to become text, sent securely and not stored by OpenAI’s transcription service. Turning it on shows exactly what happens first.',
  tidyWords: 'Tidy my words',
  tidyWordsDetail:
    'Off: your journal keeps your exact words, including ums and changes of mind. On: the text also goes through a second step at OpenAI that removes fillers and tidies it, which OpenAI may keep for up to 30 days to check for abuse.',
  /** The privacy choices' longer explanations wait behind this, in place of a wall of text. */
  aboutThis: 'About this',
  aboutThisHint: 'Shows what each choice does with your voice and words',

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
  /** Opens the support panel, at any time (docs/PRODUCT_V1.md, Trust and safety). */
  struggling: 'If you are struggling',
  strugglingDetail: supportCopy.linesTitle,
  supportAction: 'Contact support',
  supportDetail: 'Opens your email app. No echoes are attached.',
  supportSubject: 'ECHO support',
  supportFailed: (address: string) => `No email app was found. You can write to ${address}.`,
  privacyPolicy: 'Privacy policy',
  terms: 'Terms of use',
  pageFailed: (url: string) =>
    `That page couldn’t be opened. It is at ${url.replace(/^https:\/\//, '')}.`,

  about: 'About',
  version: (version: string) => `Version ${version}`,
  /** Under the version: the code in use, so that an update can be seen to have arrived. */
  updateInstalled: 'Update: as installed',
  updateFrom: (when: string) => `Update of ${when}`,
  updateArrived: 'Update: arrived',
  statement: 'ECHO is wellness software. It is not therapy, diagnosis, or emergency care.',
  /** Said plainly, as the brief asks (docs/PRODUCT_V1.md, Breathe). */
  // One source for the disclosure OpenAI's usage policies ask for: the Breathe library's own line.
  breatheVoice: SYNTHETIC_VOICE_NOTE,
} as const;
