import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { SoftScrim } from '@/components/SoftScrim';
import { ToggleRow } from '@/components/ToggleRow';
import { copy } from '@/content/copy';
import { useTheme } from '@/design/theme';
import { verifyLockAvailable } from '@/services/biometric';
import { useOnboarding, type OnboardingState } from '@/state/onboarding';

// Measured from the goldens, at the 393 x 852 reference.
const ROW_GAP = 6.5;
// The rows sit about 2 pt inside the CTA's edges.
const ROW_INSET = 2;
const CAPTION_TOP = 14;
const CAPTION = { fontSize: 10, lineHeight: 14, letterSpacing: 1.5, opacity: 0.78 } as const;
const HINT_GAP = 8;
// The plates' snow glints through small type, unlike the goldens' smooth snow, so notes get a
// feathered patch behind them. Day's is stronger: its snow is sunlit.
const SCRIM_ALPHA = { day: 0.36, night: 0.3 } as const;
const SCRIM_INSET = { x: 34, y: 14 };
const SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.4)',
  textShadowRadius: 6,
  textShadowOffset: { width: 0, height: 1 },
} as const;

/** Not in the copy deck: shown only when the phone has no biometrics set up. Owner to confirm. */
export const BIOMETRICS_UNAVAILABLE = 'Not set up on this phone.';

/** The goldens are iOS. Web, used only by the visual harness, follows them. */
const lockLabel = () =>
  Platform.OS === 'android' ? copy.privacy.lockAndroid : copy.privacy.lockIos;

/** Small, centred, read-only text on the photograph, kept legible by a soft local scrim. */
function Note({
  children,
  style,
  textStyle,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const { name } = useTheme();
  return (
    <View style={style}>
      <View pointerEvents="none" style={styles.scrim}>
        <SoftScrim alpha={SCRIM_ALPHA[name]} />
      </View>
      <EchoText variant="caption" color="textSecondary" align="center" style={[SHADOW, textStyle]}>
        {children}
      </EchoText>
    </View>
  );
}

/** The two privacy switches and the encryption note beneath them. */
export function PrivacyControls() {
  const { biometricLock, privateBackup } = useOnboarding((state) => state.privacy);
  const update = useOnboarding((state) => state.update);
  const [unavailable, setUnavailable] = useState(false);
  const checking = useRef(false);

  // Read at the moment of the change, so two quick taps never write stale values.
  const setPrivacy = useCallback(
    (patch: Partial<OnboardingState['privacy']>) =>
      update({ privacy: { ...useOnboarding.getState().privacy, ...patch } }),
    [update],
  );

  const changeLock = useCallback(
    async (next: boolean) => {
      if (checking.current) return;
      if (!next) {
        setPrivacy({ biometricLock: false });
        return;
      }
      checking.current = true;
      // Proves the person can pass the lock, so turning it on can never lock them out.
      const result = await verifyLockAvailable();
      checking.current = false;
      if (!result.ok) {
        // Never block the journey: the lock stays off, the row says why, and the user moves on.
        // Dismissing the prompt is a choice, not a limitation, so it changes nothing else.
        if (result.reason !== 'cancelled') setUnavailable(true);
        setPrivacy({ biometricLock: false });
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPrivacy({ biometricLock: true });
    },
    [setPrivacy],
  );

  // Cloud backup has no backend yet. The choice is stored, and nothing is sent or claimed.
  const changeBackup = useCallback(
    (next: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPrivacy({ privateBackup: next });
    },
    [setPrivacy],
  );

  return (
    <View style={styles.root}>
      <ToggleRow
        label={lockLabel()}
        value={biometricLock}
        onChange={changeLock}
        disabled={unavailable}
        hint={unavailable ? BIOMETRICS_UNAVAILABLE : undefined}
      />
      {unavailable && <Note style={styles.hint}>{BIOMETRICS_UNAVAILABLE}</Note>}
      <View style={{ height: ROW_GAP }} />
      <ToggleRow label={copy.privacy.backup} value={privateBackup} onChange={changeBackup} />
      {/* Informational only: not a control, so no press handler and no button role. */}
      <Note style={styles.caption} textStyle={CAPTION}>
        {copy.privacy.caption}
      </Note>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginHorizontal: ROW_INSET },
  caption: { marginTop: CAPTION_TOP },
  hint: { marginTop: HINT_GAP, marginBottom: HINT_GAP - ROW_GAP },
  scrim: {
    position: 'absolute',
    left: -SCRIM_INSET.x,
    right: -SCRIM_INSET.x,
    top: -SCRIM_INSET.y,
    bottom: -SCRIM_INSET.y,
  },
});
