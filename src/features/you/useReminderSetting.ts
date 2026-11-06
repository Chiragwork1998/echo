import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { commitReminder } from '@/features/onboarding/rhythm/commitReminder';
import { announceReminder } from '@/features/onboarding/rhythm/reminderToast';
import { formatTime, parseTime } from '@/features/onboarding/rhythm/time';
import { useClockFormat, useClockText } from '@/features/onboarding/rhythm/useClock';
import { useTimePicker } from '@/features/onboarding/rhythm/useTimePicker';
import { getNotificationPermission, openAppSettings } from '@/services/permissions';
import { useOnboarding } from '@/state/onboarding';

const DEFAULT_MINUTES = 21 * 60 + 30;
/** A wheel fires a change on every notch. The reminder is rescheduled once it settles. */
const SETTLE_MS = 700;

/** On, but the phone will not deliver notifications. */
const isBlocked = async (enabled: boolean) =>
  enabled && (await getNotificationPermission()).status !== 'granted';

/**
 * The daily reminder. The choice is saved at once; commitReminder then does the permission and
 * scheduling work exactly as onboarding does. `blocked` is true when the switch is on but the phone
 * will not deliver notifications, so the page never promises a reminder that cannot arrive.
 */
export function useReminderSetting() {
  const reminder = useOnboarding((state) => state.reminder);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minutes = parseTime(reminder.time) ?? DEFAULT_MINUTES;
  const clock = useClockText(minutes);
  const { is24Hour } = useClockFormat();

  const applying = useRef(false);

  const apply = useCallback(async (time: string, enabled: boolean) => {
    applying.current = true;
    setSaving(true);
    try {
      announceReminder(await commitReminder(time, enabled));
      setBlocked(await isBlocked(enabled));
    } finally {
      applying.current = false;
      setSaving(false);
    }
  }, []);

  const write = (patch: Partial<typeof reminder>) => {
    const { reminder: current, update } = useOnboarding.getState();
    update({ reminder: { ...current, ...patch } });
    return { ...current, ...patch };
  };

  const setEnabled = (enabled: boolean) => {
    // The switch decides what the saved time is for, so a time still waiting to settle is dropped.
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    const next = write({ enabled });
    void apply(next.time, enabled);
  };

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const time = pending.current;
    pending.current = null;
    if (time) void apply(time, useOnboarding.getState().reminder.enabled);
  }, [apply]);

  const setTime = useCallback(
    (next: number) => {
      const time = formatTime(next);
      const { reminder: current, update } = useOnboarding.getState();
      // A dragged or picked time is custom, so any preset from onboarding no longer applies.
      update({ reminder: { ...current, time, preset: undefined } });
      if (!current.enabled) return;
      pending.current = time;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SETTLE_MS);
    },
    [flush],
  );

  const picker = useTimePicker({ minutes, is24Hour, onChange: setTime });

  // Settle a change that is still waiting when the page closes.
  useEffect(() => flush, [flush]);

  // Notifications can be switched on in Settings while ECHO sits in the background.
  useEffect(() => {
    let current = true;
    // While a change is being applied its own result decides, so the prompt never flashes a warning.
    const check = () =>
      void isBlocked(useOnboarding.getState().reminder.enabled).then((next) => {
        if (current && !applying.current) setBlocked(next);
      });
    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => {
      current = false;
      subscription.remove();
    };
  }, []);

  return {
    enabled: reminder.enabled,
    timeText: clock.spoken,
    saving,
    blocked,
    setEnabled,
    openPicker: picker.open,
    pickerSheet: picker.sheet,
    openSettings: () => void openAppSettings(),
  };
}
