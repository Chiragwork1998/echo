import { useEffect, useState } from 'react';

import { restoreJournalAudio } from '@/features/breathe/audio';
import { ARRIVE } from '@/features/breathe/library/practices';
import { PracticeView, type PracticeEnd } from '@/features/breathe/PracticeView';
import { compile, DEFAULT_PACE } from '@/features/breathe/timeline';
import { deviceClock } from '@/features/journal/localDay';
import { usePlus } from '@/services/plus';
import { usePreferences } from '@/state/preferences';

import { afterArrive } from './arrive';
import { becomeCopy } from './becomeCopy';

/**
 * Become's Arrive, before the morning session: two minutes of Heart, then the theater of the mind.
 * Sound only if the person keeps sound on. A tap goes straight into the book. Before the book opens,
 * the audio is put back the way the journal records in.
 */
export function ArriveFirst({ onArrived }: { onArrived: () => void }) {
  const plus = usePlus();
  const [{ timeline, pace, sound, voice, first }] = useState(() => {
    const prefs = usePreferences.getState().practice;
    const chosen = plus.isPlus ? prefs.pace : DEFAULT_PACE;
    return {
      timeline: compile(ARRIVE, { pace: chosen }),
      pace: chosen,
      sound: prefs.sound,
      voice: prefs.voice,
      first: prefs.begun === 0,
    };
  });

  useEffect(() => {
    const { practice, updatePractice } = usePreferences.getState();
    updatePractice({ begun: practice.begun + 1 });
  }, []);

  const handOver = async (end: PracticeEnd) => {
    const { practice, updatePractice } = usePreferences.getState();
    updatePractice(afterArrive(practice, end.finished, deviceClock.localDay(new Date())));
    await restoreJournalAudio();
    onArrived();
  };

  return (
    <PracticeView
      timeline={timeline}
      pace={pace}
      sound={sound}
      voice={voice}
      first={first}
      onEnd={(end) => void handOver(end)}
      endLabel={becomeCopy.skip}
      tapToEnd
    />
  );
}
