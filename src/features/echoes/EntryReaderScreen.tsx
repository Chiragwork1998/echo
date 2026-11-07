import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import type { Entry } from '@/features/journal';
import { Loading, Notice, Quiet, SkeletonLine, Surface } from '@/features/tab-pages/parts';
import { TabPage } from '@/features/tab-pages/TabPage';
import { detail, ownWords, question, textAction } from '@/features/tab-pages/textStyles';

import { echoesCopy } from './echoesCopy';
import { isMorning, longDate, minutesOf, moodLabel } from './entryFacts';
import { useEntryPlayback, type PlaybackState } from './useEntryPlayback';
import { useEntryReader, type DeleteState } from './useEntryReader';

const PLAY = 44;

/** "Morning · 6 min · Mood: Steady": what kind of echo, how long, and how the person arrived. */
function facts(entry: Entry): string {
  const parts: string[] = [];
  if (isMorning(entry)) parts.push(echoesCopy.morning);
  parts.push(echoesCopy.minutes(minutesOf(entry.durationSeconds)));
  if (entry.moodBefore) parts.push(echoesCopy.mood(moodLabel(entry.moodBefore)));
  return parts.join(' · ');
}

/**
 * The page's heading. An echo with a title of its own is headed by it, with the day beneath. One
 * without is headed by its day, as a diary page is, so its first words are read once, in place.
 */
function heading(entry: Entry): { title: string; subtitle: string } {
  const day = longDate(entry.localDay);
  const own = entry.title?.trim();
  if (own) return { title: own, subtitle: [day, facts(entry)].filter(Boolean).join(' · ') };
  return { title: day || echoesCopy.readerTitle, subtitle: facts(entry) };
}

/** The handoff's play glyph, and two bars for pause in the same weight. */
function PlayGlyph({ playing, color }: { playing: boolean; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessible={false}>
      {playing ? (
        <>
          <Rect x={6.5} y={5} width={3.5} height={14} rx={1} fill={color} />
          <Rect x={14} y={5} width={3.5} height={14} rx={1} fill={color} />
        </>
      ) : (
        <Path d="M8 5l11 7-11 7V5z" fill={color} />
      )}
    </Svg>
  );
}

function Recording({ entry }: { entry: Entry }) {
  const { colors } = useTheme();
  const { state, toggle } = useEntryPlayback(entry.id);
  const audio = entry.audio;
  if (!audio) return null;
  const length = audio.durationSeconds ?? entry.durationSeconds;
  const label: Record<PlaybackState, string> = {
    idle: echoesCopy.play,
    loading: echoesCopy.loadingAudio,
    playing: echoesCopy.pause,
    paused: echoesCopy.play,
    error: echoesCopy.play,
  };
  const busy = state === 'loading';
  const recording = echoesCopy.recording(minutesOf(length));
  return (
    <>
      <Surface radius={tokens.radius.large}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label[state]}. ${recording}`}
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={toggle}
          style={({ pressed }) => [styles.recording, pressed && styles.pressed]}
        >
          <View style={[styles.play, { borderColor: colors.borderGlass }, busy && styles.waiting]}>
            <PlayGlyph playing={state === 'playing'} color={colors.textPrimary} />
          </View>
          <View style={styles.recordingText}>
            <EchoText variant="bodyM" maxFontSizeMultiplier={1.6}>
              {label[state]}
            </EchoText>
            <EchoText
              variant="bodyM"
              color="textSecondary"
              style={detail}
              maxFontSizeMultiplier={1.6}
            >
              {recording}
            </EchoText>
          </View>
        </Pressable>
      </Surface>
      {state === 'error' && <Notice message={echoesCopy.audioError} onAction={toggle} />}
      {audio.recovered && <Quiet>{echoesCopy.recovered}</Quiet>}
    </>
  );
}

/** The person's words, as a page: the question they answered, then what they said, in their size. */
function Words({ entry }: { entry: Entry }) {
  const words = entry.body.trim();
  if (!words && entry.audio) return null;
  return (
    <Surface strength="strong" radius={tokens.radius.large}>
      <View style={styles.page}>
        {entry.promptText ? (
          <EchoText
            variant="bodyL"
            color="textSecondary"
            style={[question, styles.prompt]}
            maxFontSizeMultiplier={1.5}
          >
            {entry.promptText}
          </EchoText>
        ) : null}
        {words ? (
          <EchoText variant="bodyL" style={ownWords} maxFontSizeMultiplier={1.6}>
            {entry.body}
          </EchoText>
        ) : (
          <EchoText variant="bodyM" color="textSecondary" style={detail}>
            {echoesCopy.noWords}
          </EchoText>
        )}
      </View>
    </Surface>
  );
}

/** Delete sits at the foot of the page, quiet, and still asks before anything goes. */
function DeleteAction({ state, onPress }: { state: DeleteState; onPress: () => void }) {
  const { colors } = useTheme();
  const deleting = state === 'deleting';
  const label = deleting ? echoesCopy.deleting : echoesCopy.delete;
  return (
    <>
      {state === 'error' && <Notice message={echoesCopy.deleteError} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: deleting, busy: deleting }}
        disabled={deleting}
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [styles.delete, (pressed || deleting) && styles.pressed]}
      >
        <EchoText
          variant="bodyM"
          style={[textAction, { color: colors.danger }]}
          maxFontSizeMultiplier={1.6}
        >
          {label}
        </EchoText>
      </Pressable>
    </>
  );
}

/** While the echo opens: a page of lines where its words will be. */
function PageSkeleton() {
  return (
    <Loading label={echoesCopy.readerLoading}>
      <Surface strength="strong" radius={tokens.radius.large}>
        <View style={[styles.page, styles.skeleton]}>
          {(['92%', '86%', '95%', '64%'] as const).map((width) => (
            <SkeletonLine key={width} width={width} height={12} />
          ))}
        </View>
      </Surface>
    </Loading>
  );
}

/** Reads one echo, plays its recording if it has one, and deletes it behind a confirmation. */
export function EntryReaderScreen({ id }: { id: string | null }) {
  const { view, retry, deleteState, confirmDelete, back } = useEntryReader(id);

  if (view.kind === 'entry') {
    const { title, subtitle } = heading(view.entry);
    return (
      <TabPage title={title} subtitle={subtitle} tabBar={false} onBack={back}>
        <Words entry={view.entry} />
        <Recording entry={view.entry} />
        <DeleteAction state={deleteState} onPress={confirmDelete} />
      </TabPage>
    );
  }

  if (view.kind === 'unreadable') {
    return (
      <TabPage title={echoesCopy.unreadable} tabBar={false} onBack={back}>
        <Quiet>{echoesCopy.unreadableBody}</Quiet>
        <DeleteAction state={deleteState} onPress={confirmDelete} />
      </TabPage>
    );
  }

  return (
    <TabPage title={echoesCopy.readerTitle} tabBar={false} onBack={back}>
      {view.kind === 'loading' && <PageSkeleton />}
      {view.kind === 'error' && (
        <Notice message={echoesCopy.readerError} onAction={() => void retry()} />
      )}
    </TabPage>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: tokens.space[16],
    paddingHorizontal: tokens.space[24],
    paddingTop: tokens.space[24],
    paddingBottom: tokens.space[32],
  },
  prompt: { fontSize: 20, lineHeight: 26 },
  skeleton: { gap: tokens.space[16], paddingTop: tokens.space[32] },
  recording: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[16],
    paddingHorizontal: tokens.space[16],
    paddingVertical: tokens.space[12],
  },
  play: {
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY / 2,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waiting: { opacity: 0.5 },
  recordingText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
  delete: {
    minHeight: tokens.size.tapTarget,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[16],
    marginTop: tokens.space[8],
  },
});
