import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { tokens } from '@/design/tokens';
import { Notice, Quiet } from '@/features/tab-pages/parts';
import { TabPage } from '@/features/tab-pages/TabPage';

import { echoesCopy } from './echoesCopy';
import { EntryRow } from './EntryRow';
import { SearchField } from './SearchField';
import { useEchoes, type EchoesView } from './useEchoes';

export const ENTRY_PATH = '/home/entry';
const openEntry = (id: string) => router.push({ pathname: ENTRY_PATH, params: { id } } as never);

function Body({
  view,
  onRetry,
  onClear,
}: {
  view: EchoesView;
  onRetry: () => void;
  onClear: () => void;
}) {
  switch (view.kind) {
    case 'loading':
      return <Quiet busy>{echoesCopy.loading}</Quiet>;
    case 'searching':
      return <Quiet busy>{echoesCopy.searching}</Quiet>;
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
      return <Quiet>{echoesCopy.empty}</Quiet>;
    case 'no_matches':
      return (
        <>
          <Quiet>{echoesCopy.noMatches}</Quiet>
          {view.unreadable > 0 && <Quiet>{echoesCopy.skippedInSearch(view.unreadable)}</Quiet>}
        </>
      );
    case 'list':
      return (
        <>
          {view.stale && <Notice message={echoesCopy.loadError} onAction={onRetry} />}
          <View style={styles.list}>
            {view.rows.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onOpen={openEntry} />
            ))}
          </View>
          {view.unreadable > 0 && <Quiet>{echoesCopy.skippedInSearch(view.unreadable)}</Quiet>}
        </>
      );
  }
}

/** The private archive: every committed echo, newest first, searchable on this phone. */
export function EchoesScreen() {
  const [query, setQuery] = useState('');
  const { view, retry } = useEchoes(query);
  return (
    <TabPage title={echoesCopy.title}>
      <SearchField value={query} onChange={setQuery} />
      <Body view={view} onRetry={() => void retry()} onClear={() => setQuery('')} />
    </TabPage>
  );
}

const styles = StyleSheet.create({ list: { gap: tokens.space[12] } });
