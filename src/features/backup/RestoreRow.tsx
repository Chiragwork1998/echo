import { Row } from '@/features/tab-pages/parts';

import { restoreCopy } from './restoreCopy';
import { RestoreSheet } from './RestoreSheet';
import { useRestore } from './useRestore';

/**
 * Restore from a backup, for You's Your data. One row, so it drops into that Section beside Export
 * and Delete all data, and everything after the tap happens in its own sheet: the system picker, a
 * preview of what the backup holds, the restore with its progress, and the result.
 */
export function RestoreRow() {
  const { state, locked, choose, confirm, dismiss } = useRestore();
  const reading = state.kind === 'reading';
  return (
    <>
      <Row
        label={reading ? restoreCopy.reading : restoreCopy.row}
        detail={restoreCopy.rowDetail}
        hint={restoreCopy.rowHint}
        busy={reading}
        onPress={() => void choose()}
      />
      <RestoreSheet
        state={state}
        visible={!locked}
        onRestore={() => void confirm()}
        onChoose={() => void choose()}
        onClose={dismiss}
      />
    </>
  );
}
