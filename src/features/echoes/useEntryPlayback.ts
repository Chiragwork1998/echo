import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { openEntryAudio } from '@/features/journal';
import { loadAudio } from '@/services/nativeModules';

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

type Session = { stop: () => void; player: { play(): void; pause(): void } };

/**
 * Plays one entry's recording. Opening it decrypts a copy to disk, so every way out of playback
 * (finished, error, leaving the page, the app going to the background) ends in release(), which
 * deletes that copy. Nothing about the recording is logged.
 */
export function useEntryPlayback(entryId: string) {
  const [state, setState] = useState<PlaybackState>('idle');
  const session = useRef<Session | null>(null);
  const opening = useRef(false);
  const mounted = useRef(true);

  const stop = useCallback((next: PlaybackState = 'idle') => {
    const current = session.current;
    session.current = null;
    current?.stop();
    if (mounted.current) setState(next);
  }, []);

  const start = useCallback(async () => {
    if (opening.current || session.current) return;
    opening.current = true;
    setState('loading');
    const opened = await openEntryAudio(entryId);
    if (!opened.ok) {
      opening.current = false;
      if (mounted.current) setState('error');
      return;
    }
    const { uri, release } = opened.value;
    if (!mounted.current) {
      release();
      opening.current = false;
      return;
    }
    try {
      const audio = loadAudio();
      await audio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (!mounted.current) return release();
      const player = audio.createAudioPlayer({ uri });
      const listener = player.addListener('playbackStatusUpdate', (status) => {
        // Not inside the player's own event: it is released here.
        if (status.didJustFinish) queueMicrotask(() => stop());
      });
      session.current = {
        player,
        stop: () => {
          listener.remove();
          player.remove();
          release();
        },
      };
      player.play();
      setState('playing');
    } catch {
      release();
      session.current = null;
      if (mounted.current) setState('error');
    } finally {
      opening.current = false;
    }
  }, [entryId, stop]);

  const toggle = useCallback(() => {
    const current = session.current;
    if (!current) return void start();
    if (state === 'playing') {
      current.player.pause();
      setState('paused');
    } else {
      current.player.play();
      setState('playing');
    }
  }, [start, state]);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') stop();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      stop();
    };
  }, [stop]);

  return { state, toggle };
}
