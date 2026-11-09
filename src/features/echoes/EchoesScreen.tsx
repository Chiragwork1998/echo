import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { tokens } from '@/design/tokens';
import type { EntrySummary } from '@/features/journal';
import { keepTogether } from '@/features/tab-pages/keepTogether';
import { Notice, Quiet, Surface, TextAction } from '@/features/tab-pages/parts';
import { ArriveInOrder, Resolve } from '@/features/tab-pages/Resolve';
import { TabPage } from '@/features/tab-pages/TabPage';
import { detail, question } from '@/features/tab-pages/textStyles';
import { useInView } from '@/features/tab-pages/useInView';
import { HOME_PATH } from '@/state/routing';

import { echoesCopy } from './echoesCopy';
import { EchoesList, EchoesSkeleton } from './EchoesList';
import { SearchField } from './SearchField';
import { useEchoes, type EchoesView } from './useEchoes';

export const ENTRY_PATH = '/home/entry';
const openEntry = (id: string) => router.push({ pathname: ENTRY_PATH, params: { id } } as never);

/** A calm block of words on glass: a Cormorant line, and what to do next. */
function Composed({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Surface radius={tokens.radius.large}>
      <View style={styles.composed} accessible={!action} accessibilityLiveRegion="polite">
        <EchoText variant="bodyL" style={question} maxFontSizeMultiplier={1.5}>
          {keepTogether(title)}
        </EchoText>
        {body ? (
          <EchoText
            variant="bodyM"
            color="textSecondary"
            style={detail}
            maxFontSizeMultiplier={1.6}
          >
            {keepTogether(body)}
          </EchoText>
        ) : null}
        {action}
      </View>
    </Surface>
  );
}

function Body({
  view,
  waitingRows,
  previouslyEmpty,
  deleted,
  inView,
  onRetry,
  onClear,
}: {
  view: EchoesView;
  /** What was listed before the search now running. */
  waitingRows: readonly EntrySummary[];
  /** The last answer was 'nothing returned', and is still the one on screen. */
  previouslyEmpty: boolean;
  /** Echoes deleted while the list may still hold them. */
  deleted: ReadonlySet<string>;
  /** The page is in view, so a deleted row can be seen to leave. */
  inView: boolean;
  onRetry: () => void;
  onClear: () => void;
}) {
  switch (view.kind) {
    case 'loading':
      // Resolve draws the skeleton until the archive has opened; there is nothing else to say.
      return null;
    case 'searching':
      // Each of these has the shape of the answer it replaces, so React keeps the list's instance
      // and the months are never torn down and built again for a keystroke.
      if (waitingRows.length > 0) {
        return (
          <>
            {null}
            <EchoesList
              rows={waitingRows}
              onOpen={openEntry}
              waiting
              deleted={deleted}
              inView={inView}
            />
            {null}
          </>
        );
      }
      return previouslyEmpty ? (
        <>
          <Composed title={echoesCopy.noMatches} body={echoesCopy.noMatchesHint} />
          {null}
        </>
      ) : (
        <EchoesSkeleton />
      );
    case 'error':
      return view.searching ? (
        <Notice
          message={echoesCopy.searchError}
          actionLabel={echoesCopy.clearSearch}
          onAction={onClear}
        />
      ) : (
        <Notice message={echoesCopy.loadError} onAction={onRetry} />
      );
    case 'empty':
      return (
        <Composed
          title={echoesCopy.empty}
          body={echoesCopy.emptyBody}
          action={
            <TextAction
              label={echoesCopy.goToday}
              onPress={() => router.navigate(HOME_PATH as never)}
              style={styles.action}
            />
          }
        />
      );
    case 'no_matches':
      return (
        <>
          <Composed title={echoesCopy.noMatches} body={echoesCopy.noMatchesHint} />
          {view.unreadable > 0 && <Quiet>{echoesCopy.skippedInSearch(view.unreadable)}</Quiet>}
        </>
      );
    case 'list':
      return (
        <>
          {view.stale && <Notice message={echoesCopy.loadError} onAction={onRetry} />}
          <EchoesList rows={view.rows} onOpen={openEntry} deleted={deleted} inView={inView} />
          {view.unreadable > 0 && <Quiet>{echoesCopy.skippedInSearch(view.unreadable)}</Quiet>}
        </>
      );
  }
}

const NONE: readonly EntrySummary[] = [];

/** Nothing to search before the archive has opened, when it is empty, or when it cannot be read. */
const searchable = (view: EchoesView) =>
  view.kind !== 'loading' && view.kind !== 'empty' && !(view.kind === 'error' && !view.searching);

/** The private archive: every committed echo, newest first, searchable on this phone. */
export function EchoesScreen() {
  const [query, setQuery] = useState('');
  const { view, retry, deleted } = useEchoes(query);
  const inView = useInView();
  // While a search runs, the rows already on screen stay, quietly, instead of flashing away.
  const [shown, setShown] = useState<readonly EntrySummary[]>(NONE);
  const latest =
    view.kind === 'list'
      ? view.rows
      : view.kind === 'empty' || view.kind === 'no_matches'
        ? NONE
        : shown;
  if (latest !== shown) setShown(latest);
  // Remember what the last answer was, so a longer query that has not been answered yet does not
  // swap a 'nothing returned' panel for a skeleton and back again.
  const [settled, setSettled] = useState<'list' | 'no_matches' | null>(null);
  const kind = view.kind === 'list' || view.kind === 'no_matches' ? view.kind : null;
  if (kind && kind !== settled) setSettled(kind);
  return (
    <TabPage title={echoesCopy.title}>
      <Resolve
        ready={view.kind !== 'loading'}
        skeleton={<EchoesSkeleton />}
        style={styles.body}
        rows
        atOnce
      >
        {/* Inside the arrival, so the field comes with the first rows and does not pop in ahead of them. */}
        {searchable(view) && (
          <ArriveInOrder index={0} step={40} cap={8}>
            <SearchField value={query} onChange={setQuery} />
          </ArriveInOrder>
        )}
        <Body
          view={view}
          waitingRows={shown}
          previouslyEmpty={settled === 'no_matches' && query.trim() !== ''}
          deleted={deleted}
          inView={inView}
          onRetry={() => void retry()}
          onClear={() => setQuery('')}
        />
      </Resolve>
    </TabPage>
  );
}

const styles = StyleSheet.create({
  // The page's own rhythm, kept for what Resolve now wraps.
  body: { gap: tokens.space[24] },
  composed: {
    gap: tokens.space[8],
    paddingHorizontal: tokens.space[24],
    paddingTop: tokens.space[24],
    paddingBottom: tokens.space[20],
  },
  action: { marginTop: tokens.space[4], marginBottom: -tokens.space[8] },
});
