import { useState } from 'react';

import { VoiceConsentSheet } from '@/features/journal-session/VoiceConsentSheet';
import { useRequirePlus } from '@/services/plus';
import { usePreferences, useVoiceStatus } from '@/state/preferences';

/**
 * "Turn my voice into words". Off by default, and off whenever the person has not agreed. Turning it
 * on always shows what leaves the phone first, so the choice is never made without the facts; turning
 * it off is immediate, and recordings from then on stay on the phone.
 */
export function useVoiceSetting() {
  const status = useVoiceStatus();
  const tidy = usePreferences((state) => state.tidyWords);
  const [asking, setAsking] = useState(false);
  const { setVoiceConsent } = usePreferences.getState();
  const requirePlus = useRequirePlus();

  const sheet = (
    <VoiceConsentSheet
      visible={asking}
      onAllow={() => {
        setVoiceConsent('allowed');
        setAsking(false);
      }}
      onKeep={() => {
        setVoiceConsent('voice_only');
        setAsking(false);
      }}
      onClose={() => setAsking(false)}
    />
  );

  return {
    enabled: status === 'allowed',
    /** Tidy my words: off keeps the exact words. It changes what OpenAI does, not whether to ask. */
    tidy,
    /** Turning Tidy on is ECHO Plus. Turning it off never is. */
    changeTidy: (next: boolean) => {
      if (next && !requirePlus('tidy')) return;
      usePreferences.getState().setTidyWords(next);
    },
    change: (next: boolean) => (next ? setAsking(true) : setVoiceConsent('voice_only')),
    sheet,
  };
}
