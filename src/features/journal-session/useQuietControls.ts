import { useCallback, useEffect, useRef, useState } from 'react';

import { QUIET_MS } from './sky';

type Options = {
  /** A screen reader is running: the controls stay, and nothing waits on a timer. */
  always: boolean;
  /** Something needs the controls now, such as a failed Reflect. */
  pinned: boolean;
};

/**
 * When the quiet controls are wanted: after a few seconds without typing, or when the scenery is
 * touched, and gone the moment someone types.
 */
export function useQuietControls({ always, pinned }: Options) {
  const [wanted, setWanted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => disarm, [disarm]);

  /** Starts counting the quiet. */
  const arm = useCallback(() => {
    disarm();
    timer.current = setTimeout(() => setWanted(true), QUIET_MS);
  }, [disarm]);
  /** A keystroke: the controls leave, and the count begins again. */
  const typed = useCallback(() => {
    setWanted(false);
    arm();
  }, [arm]);
  const show = useCallback(() => {
    disarm();
    setWanted(true);
  }, [disarm]);
  const hide = useCallback(() => {
    disarm();
    setWanted(false);
  }, [disarm]);

  return { visible: always || pinned || wanted, arm, disarm, typed, show, hide };
}
