import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingHeader } from '@/components/OnboardingHeader';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { useLayout } from '@/design/layout';
import { backPath, nextPath } from '@/features/onboarding/flow';
import { commitReminder } from '@/features/onboarding/rhythm/commitReminder';
import { PRESETS, PresetCards } from '@/features/onboarding/rhythm/PresetCards';
import { ReminderRow } from '@/features/onboarding/rhythm/ReminderRow';
import { announceReminder } from '@/features/onboarding/rhythm/reminderToast';
import { RhythmHeading } from '@/features/onboarding/rhythm/RhythmHeading';
import { TimeButton } from '@/features/onboarding/rhythm/TimeButton';
import { TimeDial, dialSize } from '@/features/onboarding/rhythm/TimeDial';
import { formatTime, parseTime } from '@/features/onboarding/rhythm/time';
import { useClockFormat, useClockText } from '@/features/onboarding/rhythm/useClock';
import { useTimePicker } from '@/features/onboarding/rhythm/useTimePicker';
import { useOnboarding, type ReminderPreset } from '@/state/onboarding';

const STEP = 4;
const BEFORE_SLEEP = PRESETS[2]?.minutes ?? 21 * 60 + 30;
// Measured from the golden, which insets the cards and the row 2 pt inside the gutters.
const BLOCK_INSET = 2;
const CARDS_TO_ROW = 19.5;
const ROW_TO_CTA = 11.5;
const DIAL_DROP = 32; // the dial sits a little below the middle of the space it has
const COMPACT_CARDS_TO_ROW = 12;
// Height the dial layout needs besides the dial and the safe areas: header, heading, cards, row and
// button. A shorter screen gets the scrolling layout instead.
const DIAL_LAYOUT_CHROME = 385;
const LIST_GAP = 16;

export function RhythmScreen() {
  const { accessibleLayout, landscape, compact } = useLayout();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const stored = useOnboarding((state) => state.reminder);
  const update = useOnboarding((state) => state.update);

  const [minutes, setMinutes] = useState(() => parseTime(stored.time) ?? BEFORE_SLEEP);
  const [preset, setPreset] = useState<ReminderPreset | undefined>(stored.preset);
  const [enabled, setEnabled] = useState(stored.enabled);

  const clock = useClockText(minutes);
  const { is24Hour } = useClockFormat();

  // Moving the dial, or choosing a time in the picker, clears the preset: the time is now custom.
  const setCustom = useCallback((next: number) => {
    setMinutes(next);
    setPreset(undefined);
  }, []);
  const choose = useCallback((value: ReminderPreset) => {
    const target = PRESETS.find((item) => item.value === value);
    if (!target) return;
    cue('tick');
    setMinutes(target.minutes);
    setPreset(value);
  }, []);
  const picker = useTimePicker({ minutes, is24Hour, onChange: setCustom });

  const finish = async () => {
    const time = formatTime(minutes);
    update({ reminder: { time, enabled, preset } });
    // The toast rises as the next screen arrives, so the journey is never held for it.
    announceReminder(await commitReminder(time, enabled));
    const next = nextPath('rhythm');
    if (next) router.navigate(next as never);
  };

  const back = backPath('rhythm');
  const size = dialSize(width);
  const roomForDial = height >= DIAL_LAYOUT_CHROME + size + insets.top + insets.bottom;
  // The shell scrolls large text and landscape itself. A short portrait screen scrolls here.
  const shellScrolls = accessibleLayout || landscape;
  const list = shellScrolls || !roomForDial;

  const cards = <PresetCards selected={preset} onSelect={choose} stacked={accessibleLayout} />;
  // Large text, landscape and short screens: the time as a button, then the same cards and switch.
  const scrollingBody = (
    <>
      <RhythmHeading />
      <View style={styles.list}>
        <TimeButton clock={clock} onPress={picker.open} />
        {cards}
        <ReminderRow value={enabled} onChange={setEnabled} />
      </View>
    </>
  );

  return (
    <ScreenShell
      screen="rhythm"
      header={
        <OnboardingHeader
          step={STEP}
          onBack={back ? () => router.navigate(back as never) : undefined}
        />
      }
      footer={<PrimaryCTA label={copy.rhythm.cta} arrow onPress={finish} />}
    >
      {list ? (
        shellScrolls ? (
          scrollingBody
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>{scrollingBody}</ScrollView>
        )
      ) : (
        <>
          <RhythmHeading />
          <View style={[styles.dialZone, { paddingTop: compact ? 0 : DIAL_DROP }]}>
            <TimeDial
              size={size}
              minutes={minutes}
              clock={clock}
              label={copy.rhythm.title}
              onChange={setCustom}
              onOpenPicker={picker.open}
            />
          </View>
          <View style={styles.block}>
            {cards}
            <View style={{ height: compact ? COMPACT_CARDS_TO_ROW : CARDS_TO_ROW }} />
            <ReminderRow value={enabled} onChange={setEnabled} />
          </View>
        </>
      )}
      {picker.sheet}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  dialZone: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  block: { marginHorizontal: BLOCK_INSET, marginBottom: ROW_TO_CTA },
  list: { gap: LIST_GAP, marginTop: 24, marginBottom: LIST_GAP },
});
