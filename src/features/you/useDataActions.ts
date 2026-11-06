import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { deleteAllLocal } from '@/services/deleteAllLocal';
import { exportJournal } from '@/services/exportJournal';

import { youCopy } from './youCopy';

export type ExportState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; exported: number; unreadable: number }
  | { kind: 'error'; code: 'unavailable' | 'failed' };

export type DeleteAllState = 'idle' | 'deleting' | 'error';

/** Never state after unmount: a successful delete-all returns the app to Landing under us. */
function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

export function useExport() {
  const [state, setState] = useState<ExportState>({ kind: 'idle' });
  const mounted = useMounted();
  const working = useRef(false);

  const run = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setState({ kind: 'working' });
    const result = await exportJournal();
    working.current = false;
    if (!mounted.current) return;
    setState(
      result.ok
        ? { kind: 'done', exported: result.exported, unreadable: result.unreadable }
        : { kind: 'error', code: result.code },
    );
  }, [mounted]);

  return { state, run };
}

/**
 * Two native confirmations, the second stating it cannot be undone. Only then does anything go.
 * On success the app resets itself and the root layout shows Landing, so there is nothing to do.
 */
export function useDeleteAll() {
  const [state, setState] = useState<DeleteAllState>('idle');
  const mounted = useMounted();
  const working = useRef(false);

  const run = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setState('deleting');
    const result = await deleteAllLocal();
    working.current = false;
    if (mounted.current) setState(result.ok ? 'idle' : 'error');
  }, [mounted]);

  const confirm = useCallback(() => {
    const cancel = { text: youCopy.deleteCancel, style: 'cancel' } as const;
    Alert.alert(youCopy.deleteFirstTitle, youCopy.deleteFirstBody, [
      cancel,
      {
        text: youCopy.deleteContinue,
        style: 'destructive',
        onPress: () =>
          Alert.alert(youCopy.deleteFinalTitle, youCopy.deleteFinalBody, [
            cancel,
            { text: youCopy.deleteConfirm, style: 'destructive', onPress: () => void run() },
          ]),
      },
    ]);
  }, [run]);

  return { state, confirm };
}
