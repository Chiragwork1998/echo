import { useEffect, useState } from 'react';

type Settled = {
  /** What is on screen: the old text while it fades out, then the new. Null when nothing is. */
  text: string | null;
  /** Whether it should be showing. False while it fades out. */
  visible: boolean;
  /** It came out of nothing after something had already been shown: the screen was away and is back. */
  back: boolean;
  /** Something has been shown since this began. */
  seen: boolean;
};

/** What `value` asks of what is shown now, at once: new text out of nothing shows; anything else fades. */
function toward(now: Settled, value: string | null): Settled {
  if (now.text === value) {
    return now.visible === (value !== null) ? now : { ...now, visible: value !== null };
  }
  if (now.text === null) return { text: value, visible: true, back: now.seen, seen: true };
  return now.visible ? { ...now, visible: false } : now;
}

/** What it has become once the old text has had `outMs` to fade away. */
function settled(now: Settled, value: string | null): Settled {
  if (now.text === value && now.visible === (value !== null)) return now;
  return { text: value, visible: value !== null, back: false, seen: now.seen || value !== null };
}

/**
 * Text that never vanishes in one frame. When `value` changes, the old text stays (as `text`) with
 * `visible` false, for the `outMs` it takes to fade away, and only then does the new text take its
 * place. Text that arrives out of nothing shows at once; text that goes to nothing is kept until it
 * has faded. A change and a change back inside the fade ends on the text, visible.
 */
export function useSettledText(value: string | null, outMs: number) {
  const [now, setNow] = useState<Settled>({
    text: value,
    visible: value !== null,
    back: false,
    seen: value !== null,
  });
  // The old text is asked to fade in the same render that the value changes: no frame is drawn with
  // the new text under the old state.
  const next = toward(now, value);
  if (next !== now) setNow(next);
  useEffect(() => {
    const timer = setTimeout(() => setNow((current) => settled(current, value)), outMs);
    return () => clearTimeout(timer);
  }, [value, outMs]);
  return next;
}
