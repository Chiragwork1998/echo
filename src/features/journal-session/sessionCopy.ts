// Working text for the writing session. The copy deck has none of it, so it is NOT locked copy: it
// needs owner approval before moving to src/content. It stays plain and calm, and never repeats
// anything the person wrote. Strings that are in the deck live in src/content/copy.ts.
export const sessionCopy = {
  /** From INTERACTIONS_AND_STATES.md, "Offline". */
  saved: 'Saved on this device',
  timer: 'Time left',
  /** Read aloud with the disabled Reflect button, to say what it is waiting for. */
  reflectHint: 'Write a little more, or record a few seconds, to reflect.',
  /** Back with a draft. The three buttons are named in SCREEN_SPECS.md, section 07. */
  leave: {
    title: 'Keep your draft?',
    message: 'It stays on this device, and you can come back to it.',
    keep: 'Keep draft',
    discard: 'Discard',
    stay: 'Stay',
  },
  errors: {
    save: 'We couldn’t save just now. Your words are still here, and we’ll try again.',
    commit: 'We couldn’t keep this echo just now. Your words are safe. Try again.',
    open: 'We couldn’t open your draft.',
    unreadable: 'This draft can’t be opened.',
    retry: 'Try again',
  },
  speak: {
    ready: 'Tap when you’re ready.',
    starting: 'Getting ready…',
    recording: 'Take your time.',
    saving: 'Keeping your voice safe…',
    recorded: 'Recorded. Tap to record again.',
    record: 'Start recording',
    stop: 'Stop recording',
    explain: 'ECHO listens only while you record, and keeps your voice encrypted on this device.',
    allow: 'Allow microphone',
    denied: 'The microphone is off. You can still write, or turn it on in Settings.',
    settings: 'Open Settings',
    writeInstead: 'Write instead',
    unavailable: 'Recording isn’t available here.',
    failed: 'We couldn’t start recording.',
    kept: 'Your recording is kept, and will return when you reopen ECHO.',
    recovered: 'Rescued after ECHO closed. It may end early.',
    replaceTitle: 'Record again?',
    replaceMessage: 'A new recording replaces this one.',
    replace: 'Record again',
    cancel: 'Cancel',
  },
} as const;
