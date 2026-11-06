import { StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { tokens } from '@/design/tokens';
import type { Entry } from '@/features/journal';
import { Notice, Quiet, Row, Section } from '@/features/tab-pages/parts';
import { TabPage } from '@/features/tab-pages/TabPage';
import { supporting } from '@/features/tab-pages/textStyles';

import { echoesCopy } from './echoesCopy';
import { entryMeta, minutesOf } from './entryFacts';
import { useEntryPlayback, type PlaybackState } from './useEntryPlayback';
import { useEntryReader, type DeleteState } from './useEntryReader';

function Recording({ entry }: { entry: Entry }) {
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
  return (
    <>
      <Section>
        <Row
          label={label[state]}
          detail={echoesCopy.recording(minutesOf(length))}
          onPress={toggle}
          busy={state === 'loading'}
        />
      </Section>
      {state === 'error' && <Notice message={echoesCopy.audioError} onAction={toggle} />}
      {audio.recovered && <Quiet>{echoesCopy.recovered}</Quiet>}
    </>
  );
}

function Words({ entry }: { entry: Entry }) {
  return (
    <GlassCard radius={tokens.radius.medium} strength="strong">
      <View style={styles.words}>
        <EchoText variant="caption" color="textSecondary" style={supporting}>
          {entryMeta(entry)}
        </EchoText>
        {entry.title ? (
          <EchoText variant="bodyL" serif accessibilityRole="header">
            {entry.title}
          </EchoText>
        ) : null}
        {entry.body.trim() ? (
          <EchoText variant="bodyL">{entry.body}</EchoText>
        ) : entry.audio ? null : (
          <EchoText variant="bodyL" color="textSecondary">
            {echoesCopy.noWords}
          </EchoText>
        )}
      </View>
    </GlassCard>
  );
}

function DeleteRow({ state, onPress }: { state: DeleteState; onPress: () => void }) {
  return (
    <>
      {state === 'error' && <Notice message={echoesCopy.deleteError} />}
      <Section>
        <Row
          label={state === 'deleting' ? echoesCopy.deleting : echoesCopy.delete}
          onPress={onPress}
          busy={state === 'deleting'}
          destructive
        />
      </Section>
    </>
  );
}

/** Reads one echo, plays its recording if it has one, and deletes it behind a confirmation. */
export function EntryReaderScreen({ id }: { id: string | null }) {
  const { view, retry, deleteState, confirmDelete, back } = useEntryReader(id);
  return (
    <TabPage title={echoesCopy.readerTitle} tabBar={false} onBack={back}>
      {view.kind === 'loading' && <Quiet busy>{echoesCopy.readerLoading}</Quiet>}
      {view.kind === 'error' && (
        <Notice message={echoesCopy.readerError} onAction={() => void retry()} />
      )}
      {view.kind === 'unreadable' && (
        <>
          <Quiet>{echoesCopy.unreadableBody}</Quiet>
          <DeleteRow state={deleteState} onPress={confirmDelete} />
        </>
      )}
      {view.kind === 'entry' && (
        <>
          <Words entry={view.entry} />
          <Recording entry={view.entry} />
          <DeleteRow state={deleteState} onPress={confirmDelete} />
        </>
      )}
    </TabPage>
  );
}

const styles = StyleSheet.create({
  words: { gap: tokens.space[12], padding: tokens.space[20] },
});
