/**
 * Whether a take may be heard live, its words arriving as they are spoken (the stream and OpenAI's
 * realtime transcription). On, with Show words (D-019). It was off for a day (D-016): on the owner's phone
 * (2026-11-09) a live take came back as pure silence while the file recorder, two minutes before, heard
 * every word. A stream that gives nothing but zeros now hands its take to the file recorder within the
 * first second and a bit, so the take goes on and its words come when it ends (useVoiceRecorder.ts). The
 * live path is proved against OpenAI with the app's own code (voice-api/scripts/live-check.mts).
 */
export const liveWords = { enabled: true };
