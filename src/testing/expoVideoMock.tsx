// expo-video needs native code, so tests use a stand-in. It keeps every player it makes, so a test can
// ask what the app configured and what it asked the player to do, and it starts each player with
// expo-video's own defaults, which are the dangerous ones: unmuted, `auto` mixing, screen kept on.
// Use it with: jest.mock('expo-video', () => require('@/testing/expoVideoMock').expoVideoMock);
import { useState } from 'react';
import { View, type ViewProps } from 'react-native';

type Listener = (payload: { status?: string }) => void;

export class FakeVideoPlayer {
  // expo-video's defaults (VideoPlayer.types.ts).
  muted = false;
  audioMixingMode = 'auto';
  staysActiveInBackground = false;
  showNowPlayingNotification = false;
  keepScreenOnWhilePlaying = true;
  allowsExternalPlayback = true;
  loop = false;
  playing = false;
  /** Every play and pause the app asked for, in order. */
  calls: ('play' | 'pause')[] = [];
  /** What the audio-relevant settings were when playback was first asked for. */
  atFirstPlay?: { muted: boolean; audioMixingMode: string; staysActiveInBackground: boolean };
  private listeners = new Map<string, Set<Listener>>();

  constructor(readonly source: unknown) {}

  play() {
    this.atFirstPlay ??= {
      muted: this.muted,
      audioMixingMode: this.audioMixingMode,
      staysActiveInBackground: this.staysActiveInBackground,
    };
    this.playing = true;
    this.calls.push('play');
  }
  pause() {
    this.playing = false;
    this.calls.push('pause');
  }
  addListener(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return { remove: () => void set.delete(listener) };
  }
  /** Delivers an event the way the native player would. */
  emit(event: string, payload: { status?: string }) {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }
}

/** Every player made since the last reset. */
export const videoPlayers: FakeVideoPlayer[] = [];
export const resetVideoPlayers = () => {
  videoPlayers.length = 0;
};

export const expoVideoMock = {
  __esModule: true,
  useVideoPlayer: (source: unknown, setup?: (player: FakeVideoPlayer) => void) =>
    useState(() => {
      const player = new FakeVideoPlayer(source);
      setup?.(player);
      videoPlayers.push(player);
      return player;
    })[0],
  VideoView: (props: ViewProps & Record<string, unknown>) => (
    <View testID="video-view" {...props} />
  ),
};
