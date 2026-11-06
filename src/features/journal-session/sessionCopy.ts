import { specCopy } from '@/content/specCopy';

// Working text for the writing session. The copy deck has none of it, so it is NOT locked copy: it
// needs owner approval before moving to src/content. It stays plain and calm, and never repeats
// anything the person wrote. Strings that are in the deck live in src/content/copy.ts, and the
// spec's own in src/content/specCopy.ts.
export const sessionCopy = {
  saved: specCopy.savedOnDevice,
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
  /** The quiet controls of the daily echo. Two plain words. */
  quiet: { back: 'Back', stop: 'Stop' },
  errors: {
    save: 'We couldn’t save just now. Your words are still here, and we’ll try again.',
    commit: 'We couldn’t keep this echo just now. Your words are safe. Try again.',
    open: 'We couldn’t open your draft.',
    unreadable: 'This draft can’t be opened.',
    retry: 'Try again',
  },
  /**
   * Turning a recording into words (D-005). Every line that follows a failure says the recording is
   * safe, because it is: it was sealed on this phone before anything was sent.
   */
  transcribe: {
    listening: '…listening',
    /** A recording that has not become words yet, on a draft that was reopened. */
    untranscribed: 'Your recording is safe. It hasn’t become words yet.',
    action: 'Turn my voice into words',
    failed: {
      offline: 'There’s no connection just now. Your recording is safe on this phone.',
      timeout: 'That took too long. Your recording is safe on this phone.',
      server: 'ECHO couldn’t turn this into words just now. Your recording is safe.',
      tooLong:
        'This recording is too long to turn into words in one go. It’s safe on this phone, and you can write instead.',
      noSpeech: 'ECHO didn’t hear any words. Your recording is safe.',
      unsupported: 'ECHO couldn’t read this recording. It’s safe on this phone.',
      audio: 'ECHO couldn’t open this recording just now. It’s safe on this phone.',
      lost: 'One part of what you said couldn’t be turned into words. The rest is here.',
    },
    unavailable:
      'Turning your voice into words isn’t available right now. Your recording is safe, and you can write instead.',
    /** Reflect pressed while words are still on their way. */
    waiting: {
      title: 'Still turning your voice into words',
      message: 'You can wait, or go on now. Your recording stays with this echo either way.',
      wait: 'Wait',
      goOn: 'Go on',
    },
    /** Reflect pressed when a recording has no words yet. */
    missing: {
      title: 'Your recording has no words yet',
      message: 'You can try again, or go on. Your recording stays with this echo either way.',
      retry: 'Try again',
      goOn: 'Go on',
    },
    replaceMessage: 'This recording hasn’t become words yet, and a new one replaces it.',
  },
  /**
   * Said before a voice first leaves the phone, and again from You. Needs the owner's approval, and
   * the facts need checking against OpenAI's current terms before release. Raise
   * VOICE_POLICY_VERSION in state/preferences.ts whenever any of it changes.
   */
  consent: {
    title: 'Turn your voice into words?',
    intro: 'ECHO can write down what you say. This is what happens to it.',
    facts: [
      'Your voice goes to OpenAI to become text, and is sent securely.',
      'OpenAI’s transcription service does not store it, and does not train on it.',
      'The text then goes to OpenAI once more to be cleaned up. OpenAI may keep that text for up to 30 days to check for abuse, then deletes it. It is not used for training.',
      'ECHO’s own server keeps nothing.',
      'Your recording and the words stay encrypted on this phone.',
    ],
    allow: 'Allow',
    keep: 'Keep my voice only',
    note: 'Keep my voice only saves your recording on this phone and never sends it. You can change this any time in You.',
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
    kept: 'We couldn’t finish saving this recording. It’s kept for now, so try again before leaving.',
    recovered: 'Rescued after ECHO closed. It may end early.',
    replaceTitle: 'Record again?',
    replaceMessage: 'A new recording replaces this one.',
    replace: 'Record again',
    cancel: 'Cancel',
  },
} as const;
