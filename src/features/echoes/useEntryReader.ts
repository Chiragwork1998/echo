import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { deleteEntry, useEntry, type AsyncData, type Entry } from '@/features/journal';

import { echoesCopy } from './echoesCopy';

export type ReaderView =
  | { kind: 'loading' }
  | { kind: 'error' }
  /** Stored but failed decryption. It cannot be read, and it can still be deleted. */
  | { kind: 'unreadable' }
  | { kind: 'entry'; entry: Entry }
  /** Deleted, never existed, or no id: the page has nothing to show and leaves. */
  | { kind: 'gone' };

export function readerView(
  id: string | null,
  entry: Pick<AsyncData<Entry | null>, 'status' | 'data' | 'error'>,
): ReaderView {
  if (!id) return { kind: 'gone' };
  if (entry.status === 'error' && !entry.data) {
    if (entry.error?.code === 'unreadable') return { kind: 'unreadable' };
    return entry.error?.code === 'not_found' ? { kind: 'gone' } : { kind: 'error' };
  }
  if (entry.status === 'loading') return { kind: 'loading' };
  return entry.data ? { kind: 'entry', entry: entry.data } : { kind: 'gone' };
}

/** Back to wherever the person came from (the list, or Home), or to the archive from a deep link. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/home/echoes' as never);
}

export type DeleteState = 'idle' | 'deleting' | 'error';

/** Reading one entry, and deleting it behind a native confirmation. */
export function useEntryReader(id: string | null) {
  const entry = useEntry(id);
  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const left = useRef(false);
  const view = readerView(id, entry);

  // Deleting makes the entry vanish and also reports success. Leave once, never twice.
  const exit = useCallback(() => {
    if (left.current) return;
    left.current = true;
    leave();
  }, []);

  useEffect(() => {
    if (view.kind === 'gone') exit();
  }, [exit, view.kind]);

  const remove = useCallback(async () => {
    if (!id) return;
    setDeleteState('deleting');
    const result = await deleteEntry(id);
    if (result.ok || result.error.code === 'not_found') exit();
    else setDeleteState('error');
  }, [exit, id]);

  const confirmDelete = useCallback(() => {
    Alert.alert(echoesCopy.deleteTitle, echoesCopy.deleteBody, [
      { text: echoesCopy.deleteCancel, style: 'cancel' },
      { text: echoesCopy.deleteConfirm, style: 'destructive', onPress: () => void remove() },
    ]);
  }, [remove]);

  return { view, retry: entry.refresh, deleteState, confirmDelete, back: exit };
}
