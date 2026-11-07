import { useCallback, useEffect, useRef, useState } from 'react';

import {
  openBackup,
  type BackupSummary,
  type OpenedBackup,
  type RestoreCounts,
} from '@/services/importJournal';
import { useGate } from '@/state/gate';

import { discardPickerCopies, pickBackupFile } from './pickBackupFile';
import type { RestoreProblem } from './restoreCopy';

export type RestoreState =
  | { kind: 'idle' }
  /** The picker is open, or the file it gave is being read. */
  | { kind: 'reading' }
  /** Read and checked. Nothing has been written. */
  | { kind: 'preview'; summary: BackupSummary }
  | { kind: 'restoring'; done: number; total: number }
  | { kind: 'done'; counts: RestoreCounts }
  /** Stopped part way. What was added is whole, and restoring the file again adds the rest. */
  | { kind: 'stopped'; done: number; total: number }
  /** The file was not opened. Nothing was written. */
  | { kind: 'failed'; problem: RestoreProblem };

/** Progress is drawn at most this often, so a journal of thousands does not redraw thousands of times. */
const PROGRESS_EVERY_MS = 100;

const isLocked = () => useGate.getState().lock.kind === 'locked';

/**
 * Restore from a backup, from the tap to the result. Nothing starts while the journal is locked, and
 * the plaintext copy of the backup is let go the moment it is no longer needed: on Not now, when the
 * restore ends however it ends, and if this leaves the screen first.
 */
export function useRestore() {
  const [state, setState] = useState<RestoreState>({ kind: 'idle' });
  const locked = useGate((gate) => gate.lock.kind === 'locked');
  const backup = useRef<OpenedBackup | null>(null);
  const busy = useRef(false);
  const restoring = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A backup that was only being looked at goes now. One being restored lets itself go at the end.
      if (!restoring.current) backup.current?.release();
      backup.current = null;
    };
  }, []);

  const show = useCallback((next: RestoreState) => {
    if (mounted.current) setState(next);
  }, []);

  const choose = useCallback(async () => {
    if (busy.current || isLocked()) return;
    busy.current = true;
    backup.current?.release();
    backup.current = null;
    show({ kind: 'reading' });
    const picked = await pickBackupFile();
    if (picked.kind !== 'picked') {
      busy.current = false;
      if (picked.kind === 'canceled') show({ kind: 'idle' });
      else show({ kind: 'failed', problem: picked.kind === 'failed' ? 'picker' : 'unavailable' });
      return;
    }
    const opened = await openBackup(picked.uri);
    busy.current = false;
    if (!opened.ok) {
      // openBackup deletes the copy it was given. This catches one it never reached.
      discardPickerCopies();
      show({ kind: 'failed', problem: opened.code });
      return;
    }
    if (!mounted.current) {
      opened.backup.release();
      return;
    }
    backup.current = opened.backup;
    show({ kind: 'preview', summary: opened.backup.summary });
  }, [show]);

  const confirm = useCallback(async () => {
    const current = backup.current;
    if (!current || busy.current || isLocked()) return;
    busy.current = true;
    restoring.current = true;
    const total = current.summary.entries + current.summary.drafts;
    show({ kind: 'restoring', done: 0, total });
    let drawnAt = 0;
    const result = await current.restore((done, all) => {
      const now = Date.now();
      if (done < all && now - drawnAt < PROGRESS_EVERY_MS) return;
      drawnAt = now;
      show({ kind: 'restoring', done, total: all });
    });
    backup.current = null;
    busy.current = false;
    restoring.current = false;
    if (result.ok) {
      const { entries, drafts, existing, deleted, withoutAudio } = result;
      show({ kind: 'done', counts: { entries, drafts, existing, deleted, withoutAudio } });
    } else {
      show({ kind: 'stopped', done: result.done, total: result.total });
    }
  }, [show]);

  /** Not now, Close and Done. Never during a restore, which cannot be stopped half way. */
  const dismiss = useCallback(() => {
    if (restoring.current) return;
    backup.current?.release();
    backup.current = null;
    show({ kind: 'idle' });
  }, [show]);

  return { state, locked, choose, confirm, dismiss };
}
