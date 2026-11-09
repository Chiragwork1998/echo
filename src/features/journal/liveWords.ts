/**
 * Whether a take may be heard live, its words arriving as they are spoken (the stream and OpenAI's
 * realtime transcription). Off in 1.0: on the owner's phone (2026-11-09) a live take came back with no
 * words where the same phone's recorded take was transcribed whole, and the live path has never been proved
 * on a real microphone (the emulator's is silent). Every take is recorded to a file and made into words when
 * it ends, the way that worked. Tests of the live path turn it on.
 */
export const liveWords = { enabled: false };
