import { recordingOptions, SPEECH } from './recorderDriver';

// What expo-audio's HIGH_QUALITY preset is, and the two enums this file reads.
const module = {
  RecordingPresets: {
    HIGH_QUALITY: {
      extension: '.m4a',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
      ios: { outputFormat: 'aac ', audioQuality: 127, linearPCMBitDepth: 16 },
      web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
    },
  },
  AudioQuality: { MEDIUM: 64 },
} as unknown as Parameters<typeof recordingOptions>[0];

describe('the recorder', () => {
  const options = recordingOptions(module);

  it('records speech: mono, about 22 kHz, 40 kbps, the same on both platforms', () => {
    expect(SPEECH).toEqual({ sampleRate: 22050, numberOfChannels: 1, bitRate: 40000 });
    expect(options).toMatchObject({ sampleRate: 22050, numberOfChannels: 1, bitRate: 40000 });
    // Neither platform overrides the numbers, so both use these.
    expect(options.android).not.toHaveProperty('sampleRate');
    expect(options.ios).not.toHaveProperty('sampleRate');
  });

  it('keeps a crashed Android recording playable with ADTS, and iOS on MPEG-4', () => {
    expect(options.android).toMatchObject({ extension: '.aac', outputFormat: 'aac_adts' });
    expect(options.extension).toBe('.m4a');
  });

  it('asks iOS for an AAC quality a 40 kbps stream can carry', () => {
    expect(options.ios).toMatchObject({ outputFormat: 'aac ', audioQuality: 64 });
  });

  it('reads the level, so a microphone that gives nothing can be told from a quiet room', () => {
    expect(options.isMeteringEnabled).toBe(true);
  });

  it('sends only extensions the voice server accepts', () => {
    const accepted = /\.(m4a|mp4|aac|mp3|wav|webm)$/i; // voice-api/api/transcribe.ts
    expect(options.extension).toMatch(accepted);
    expect(options.android.extension).toMatch(accepted);
  });

  it('fits about 14 minutes under the server limit of 4.4 MB', () => {
    const limitBytes = 4_400_000;
    const seconds = (limitBytes * 8) / SPEECH.bitRate;
    expect(seconds / 60).toBeGreaterThanOrEqual(14);
    expect(seconds / 60).toBeLessThan(15);
  });
});
