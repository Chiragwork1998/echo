import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';
import { decryptAudioToCache, deleteFileIfPresent } from '@/storage/audioStore';

function clock(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function AudioPlayback({ path, id, onPaper = false }: { path: string; id: string; onPaper?: boolean }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const { theme } = useEchoTheme();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const temporary = useRef<string | null>(null);
  const mounted = useRef(true);
  const opening = useRef(false);
  const color = onPaper ? theme.color.textInk : theme.color.textPrimary;
  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') player.pause();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      deleteFileIfPresent(temporary.current);
      temporary.current = null;
    };
  }, [player]);

  const toggle = async () => {
    if (opening.current) return;
    if (Platform.OS === 'web') { setError('Play voice recordings in the mobile app.'); return; }
    opening.current = true;
    setBusy(true);
    setError('');
    try {
      if (status.playing) { player.pause(); return; }
      if (!temporary.current) {
        const uri = await decryptAudioToCache(path, `${id}-playback`, 'm4a');
        if (!mounted.current) { deleteFileIfPresent(uri); return; }
        temporary.current = uri;
        player.replace({ uri });
      }
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) await player.seekTo(0);
      player.play();
    } catch {
      if (mounted.current) setError('This recording could not be played. Your saved file has not been changed.');
    } finally {
      opening.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const rewind = async () => {
    if (!temporary.current || busy) return;
    try { await player.seekTo(Math.max(0, status.currentTime - 15)); }
    catch { setError('Could not skip back. Try playing again.'); }
  };

  return <View style={styles.player}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Opening your recording' : status.playing ? 'Pause recording' : 'Play your recording'} disabled={busy} onPress={() => void toggle()} style={[styles.play, { backgroundColor: onPaper ? theme.color.textInk : theme.color.surfacePrimary }]}>
        <Svg width={20} height={20} viewBox="0 0 24 24"><Path d={status.playing ? 'M6 5h4v14H6V5Zm8 0h4v14h-4V5Z' : 'm8 5 11 7-11 7V5Z'} fill={onPaper ? theme.color.surfacePrimary : theme.color.textInk} /></Svg>
      </Pressable>
      <View style={styles.details}>
        <Text style={[styles.title, { color }]}>{busy ? 'Opening your voice…' : status.playing ? 'A moment, playing back.' : 'In your own voice.'}</Text>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} accessibilityLabel="Recording playback progress" style={[styles.track, { backgroundColor: theme.color.accentWarm }]}><View style={[styles.progress, { width: `${progress * 100}%`, backgroundColor: color }]} /></View>
        <Text style={[styles.time, { color }]}>{clock(status.currentTime)} / {clock(status.duration)}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Rewind recording 15 seconds" disabled={!status.isLoaded || busy} onPress={() => void rewind()} style={[styles.rewind, { opacity: status.isLoaded && !busy ? 1 : 0.35 }]}><Text style={[styles.rewindText, { color }]}>↶</Text><Text style={[styles.time, { color }]}>15s</Text></Pressable>
    </View>
    {error ? <Text accessibilityRole="alert" style={[styles.error, { color }]}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  player: { gap: 12, paddingVertical: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  details: { flex: 1, gap: 8 },
  title: { ...tokens.type.uiMedium, fontSize: 11, lineHeight: 17 },
  track: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progress: { height: 3 },
  time: { ...tokens.type.ui, fontSize: 10, lineHeight: 14, opacity: 0.65 },
  rewind: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rewindText: { fontSize: 23, lineHeight: 23 },
  error: { ...tokens.type.ui, fontSize: 12, lineHeight: 20 },
});
