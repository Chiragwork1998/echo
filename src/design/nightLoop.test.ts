import type { VideoPlayer } from 'expo-video';

import { FakeVideoPlayer } from '@/testing/expoVideoMock';

import {
  configureNightLoopPlayer,
  NIGHT_LOOP_PLATE,
  NIGHT_LOOP_PLAYER,
  NIGHT_LOOP_SOURCE,
  plateCoverRect,
} from './nightLoop';

describe('the loop is scenery, and is never heard', () => {
  // These are the settings that keep the loop from taking audio focus. expo-video asks for focus on
  // Android, and activates the audio session on iOS, for a player that is playing and not muted, or
  // one set to `doNotMix`. Its defaults are unmuted, `auto`, and the screen kept awake. Changing a
  // line here is changing what happens to the person's music and to the microphone: do it on purpose.
  it('pins every audio and background setting', () => {
    expect(NIGHT_LOOP_PLAYER).toEqual({
      muted: true,
      audioMixingMode: 'mixWithOthers',
      staysActiveInBackground: false,
      showNowPlayingNotification: false,
      keepScreenOnWhilePlaying: false,
      allowsExternalPlayback: false,
      loop: true,
    });
  });

  it('sets them all on a player that starts from expo-video’s defaults', () => {
    const player = new FakeVideoPlayer(NIGHT_LOOP_SOURCE);
    expect([player.muted, player.audioMixingMode, player.keepScreenOnWhilePlaying]).toEqual([
      false,
      'auto',
      true,
    ]);
    configureNightLoopPlayer(player as unknown as VideoPlayer);
    expect(player).toMatchObject({
      muted: true,
      audioMixingMode: 'mixWithOthers',
      staysActiveInBackground: false,
      showNowPlayingNotification: false,
      keepScreenOnWhilePlaying: false,
      allowsExternalPlayback: false,
      loop: true,
    });
    // Configuring is not playing.
    expect(player.calls).toEqual([]);
  });

  it('sets silence and mixing before anything else', () => {
    const order: string[] = [];
    const spy = new Proxy({} as Record<string, unknown>, {
      set(_target, key: string) {
        order.push(key);
        return true;
      },
    });
    configureNightLoopPlayer(spy as unknown as VideoPlayer);
    expect(order.slice(0, 2)).toEqual(['muted', 'audioMixingMode']);
  });

  it('bundles one file, behind one constant', () => {
    // A require() is a bundled asset (a number on a device, a path in Jest): nothing is downloaded,
    // so it plays offline. A string would be a URL.
    expect(typeof NIGHT_LOOP_SOURCE).not.toBe('string');
    expect(JSON.stringify(NIGHT_LOOP_SOURCE)).toContain('assets/video/night-home-loop.mp4');
  });
});

describe('the loop lands on the still’s pixels', () => {
  const { width: PW, height: PH } = NIGHT_LOOP_PLATE;

  it('is the still’s size, not the video’s', () => {
    expect(NIGHT_LOOP_PLATE).toEqual({ width: 1290, height: 2796 });
  });

  it('fills the 393 x 852 reference exactly as cover does', () => {
    const rect = plateCoverRect({ width: 393, height: 852 });
    // Height-bound: the plate is 852 tall and a fraction wider than the screen.
    expect(rect.height).toBeCloseTo(852, 9);
    expect(rect.width).toBeCloseTo((852 * PW) / PH, 9);
    expect(rect.left).toBeCloseTo((393 - rect.width) / 2, 9);
    expect(rect.top).toBeCloseTo(0, 9);
  });

  it('keeps the plate’s aspect ratio and covers the frame at any size', () => {
    const frames = [
      { width: 360, height: 780 },
      { width: 412, height: 915 },
      { width: 430, height: 932 },
      { width: 820, height: 1180 }, // iPad portrait
      { width: 1180, height: 820 }, // iPad landscape
      { width: 1280, height: 800 }, // Android tablet landscape
    ];
    for (const frame of frames) {
      const rect = plateCoverRect(frame);
      expect(rect.width / rect.height).toBeCloseTo(PW / PH, 9);
      expect(rect.left).toBeLessThanOrEqual(1e-9);
      expect(rect.top).toBeLessThanOrEqual(1e-9);
      expect(rect.left + rect.width).toBeGreaterThanOrEqual(frame.width - 1e-9);
      expect(rect.top + rect.height).toBeGreaterThanOrEqual(frame.height - 1e-9);
      // Centred.
      expect(rect.left + rect.width / 2).toBeCloseTo(frame.width / 2, 9);
      expect(rect.top + rect.height / 2).toBeCloseTo(frame.height / 2, 9);
    }
  });

  it('crops top and bottom in landscape, where the plate is width-bound', () => {
    const rect = plateCoverRect({ width: 1180, height: 820 });
    expect(rect.width).toBeCloseTo(1180, 9);
    expect(rect.height).toBeCloseTo((1180 * PH) / PW, 9);
    expect(rect.top).toBeLessThan(0);
  });

  it('agrees with usePlatePoint’s model of where cover puts a point of the 393 x 852 reference', () => {
    // usePlatePoint maps a reference point with scale = max(w / 393, h / 852) about the centre.
    // The loop must put the same point of the plate in the same place.
    const frame = { width: 428, height: 926 };
    const rect = plateCoverRect(frame);
    const pointScale = Math.max(frame.width / 393, frame.height / 852);
    const x = (frame.width - 393 * pointScale) / 2 + 100 * pointScale;
    const y = (frame.height - 852 * pointScale) / 2 + 400 * pointScale;
    // The same point as a fraction of the plate, on both models.
    const fraction = { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height };
    const referenceFraction = { x: 100 / 393, y: 400 / 852 };
    expect(fraction.y).toBeCloseTo(referenceFraction.y, 3);
    // The reference canvas is 0.03 percent narrower than the plate's aspect, so x agrees to a pixel.
    expect(Math.abs(fraction.x - referenceFraction.x) * frame.width).toBeLessThan(1);
  });
});
