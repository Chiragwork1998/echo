import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { TimeDial, parseTimeToMinutes } from '@/components/TimeDial';
import { ToggleRow } from '@/components/ToggleRow';
import { tokens } from '@/design/tokens';
import { deviceCapabilities } from '@/services/capabilities';
import { cancelDailyReminder, scheduleDailyReminder } from '@/services/notifications';
import {
  REMINDER_PRESETS,
  setCurrentStep,
  setNotificationPermission,
  setReminderEnabled,
  setReminderTime,
  useOnboardingRestore,
  useOnboardingState,
  type ReminderPreset,
} from '@/state/onboardingSelections';

function formatDisplayTime(localTime: string): string {
  const minutes = parseTimeToMinutes(localTime);
  const hours24 = Math.floor(minutes / 60);
  const suffix = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${`${minutes % 60}`.padStart(2, '0')} ${suffix}`;
}

export default function RhythmScreen() {
  const router = useRouter();
  const reminder = useOnboardingState((state) => state.reminder);
  const [submitting, setSubmitting] = useState(false);

  useOnboardingRestore();

  useEffect(() => {
    setCurrentStep(4);
  }, []);

  const selectPreset = (preset: ReminderPreset, localTime: string) => {
    setReminderTime(localTime, preset);
  };

  const reminderCaption =
    reminder.notificationPermission === 'granted'
      ? `We’ll meet you at ${formatDisplayTime(reminder.localTime)}.`
      : reminder.notificationPermission === 'denied'
        ? 'Reminders are off in Settings. Your time is saved.'
        : 'A calmer you tomorrow';

  const finish = async () => {
    setSubmitting(true);
    try {
      setCurrentStep(4);
      if (reminder.enabled) {
        // Permission is only ever requested after the user sets a rhythm.
        const status = await deviceCapabilities.notifications.request();
        setNotificationPermission(status);
        // Only a granted permission may schedule; denial keeps the chosen time.
        if (status === 'granted') {
          await scheduleDailyReminder(reminder.localTime);
        }
      } else {
        await cancelDailyReminder();
      }
      router.push('/onboarding/privacy' as Href);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingScaffold
      currentStep={4}
      footer={
        <PrimaryCTA
          disabled={submitting}
          label="Set my rhythm"
          onPress={() => {
            void finish();
          }}
        />
      }
      onBack={() => router.back()}
      screen="rhythm"
      subtitle="A small daily ritual works best when it has a place in your day."
      title="When can we meet you?"
    >
      <View accessibilityRole="radiogroup" style={styles.presets}>
        {REMINDER_PRESETS.map((preset) => (
          <Chip
            key={preset.id}
            label={preset.label}
            onPress={() => selectPreset(preset.id, preset.localTime)}
            selected={reminder.preset === preset.id}
          />
        ))}
      </View>

      <View style={styles.dial}>
        <TimeDial
          localTime={reminder.localTime}
          onChange={(localTime) => setReminderTime(localTime, 'custom')}
        />
      </View>

      <View style={styles.toggle}>
        <ToggleRow
          caption={reminderCaption}
          icon="bell"
          label="Gentle reminder"
          onValueChange={(enabled) => {
            setReminderEnabled(enabled);
            if (!enabled) {
              void cancelDailyReminder();
            }
          }}
          value={reminder.enabled}
        />
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  presets: { flexDirection: 'row', justifyContent: 'center', gap: tokens.space[8] },
  dial: { marginTop: tokens.space[20], alignItems: 'center' },
  toggle: { marginTop: tokens.space[20] },
});
