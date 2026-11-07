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
      unexpected:
        'Something went wrong while sending. Your recording is safe, and trying again may work.',
      audio: 'ECHO couldn’t open this recording just now. It’s safe on this phone.',
      lost: 'One part of what you said couldn’t be turned into words. The rest is here.',
      /** ECHO Plus's fair use for the month (docs/PRODUCT_V1.md). Rare, and said plainly. */
      fairUse:
        'You’ve used this month’s voice into words. Your recording is safe, and it can become words next month.',
    },
    /**
     * The free month is used (docs/PRODUCT_V1.md, ECHO Plus). Said under `untranscribed`, so the note
     * reads as one: the recording is safe, and why it is not words yet. Nothing was sent or spent.
     */
    allowance: {
      line: 'This month’s 60 free minutes of voice into words are used. It can become words with ECHO Plus, or next month.',
      plus: 'Get ECHO Plus',
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
   * the facts need checking against OpenAI's current terms before release (checked 2026-11-06 against
   * developers.openai.com/api/docs/guides/your-data). Raise VOICE_POLICY_VERSION in
   * state/preferences.ts whenever any of it changes.
   */
  consent: {
    title: 'Turn your voice into words?',
    intro: 'ECHO can write down what you say. This is what happens to it.',
    facts: [
      'Your voice goes to OpenAI to become text, and is sent securely.',
      'OpenAI’s transcription service does not store it, and does not train on it.',
      'ECHO’s own server keeps none of your voice or words.',
      'Your recording and your words are encrypted when saved on this phone.',
      'If you speak Hindi, or turn on Tidy my words, the text also goes through a second step at OpenAI. OpenAI may keep that text for up to 30 days to check for abuse, then deletes it. It is not used for training.',
    ],
    allow: 'Allow',
    keep: 'Keep my voice only',
    note: 'Keep my voice only saves your recording on this phone and never sends it. You can change this any time in You.',
  },
  /**
   * The first time Show words is turned on. Live words stream the voice while it is spoken, and
   * OpenAI's realtime service keeps abuse-monitoring data for up to 30 days, so this is said plainly
   * and hiding words is offered as the way to stop the streaming. Hiding does not avoid the second
   * step for Hindi and Tidy, and a long take is sent in parts, so the last fact says only what is
   * true. Needs the owner's approval.
   */
  liveConsent: {
    title: 'Show your words as you speak?',
    intro:
      'To show words while you talk, ECHO has to send your voice to OpenAI as you speak. This is what that means.',
    facts: [
      'Your voice streams to OpenAI as you speak, sent securely, and comes back as words on the screen.',
      'OpenAI may keep what is sent and received for up to 30 days to check for abuse, then deletes it. It is not used for training.',
      'ECHO’s own server keeps none of your voice or words. Your recording and your words are encrypted when saved on this phone.',
      'If you speak Hindi, or turn on Tidy my words, the finished text also goes through a second step at OpenAI, kept for up to 30 days in the same way.',
      'Hiding words stops the streaming. Your voice is sent after you stop, in parts if the take is long, to a transcription service that does not store it. The second step above still applies.',
    ],
    allow: 'Show words',
    keep: 'Keep words hidden',
    note: 'You can change this any time, with Show words or Hide words while you speak.',
  },
  /** The quiet word for the words, beside Back and Stop. Names what a tap does. */
  words: { show: 'Show words', hide: 'Hide words' },
  /** Live words stopped, mid-take. Said calmly, and always visible. */
  liveStopped:
    'Live words stopped. Your recording carries on, and the words will follow when you stop.',
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
