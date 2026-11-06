import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ChoiceMarker } from '@/components/ChoiceMarker';
import { EchoText } from '@/components/EchoText';
import { ToggleRow } from '@/components/ToggleRow';
import { copy } from '@/content/copy';
import { useTheme, type ThemePreference } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { Heading, Notice, OnPlate, Row, Section } from '@/features/tab-pages/parts';
import { TabPage } from '@/features/tab-pages/TabPage';
import { onPlate } from '@/features/tab-pages/textStyles';

import { APP_VERSION, openSupport, SUPPORT_EMAIL } from './support';
import { useDeleteAll, useExport, type ExportState } from './useDataActions';
import { useLockSetting, type LockNote } from './useLockSetting';
import { useReminderSetting } from './useReminderSetting';
import { useVoiceSetting } from './useVoiceSetting';
import { youCopy } from './youCopy';

const THEMES: readonly { value: ThemePreference; label: string; detail?: string }[] = [
  { value: 'day', label: youCopy.day },
  { value: 'night', label: youCopy.night },
  { value: 'automatic', label: youCopy.automatic, detail: youCopy.automaticDetail },
];

function Appearance() {
  const { preference, setPreference } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={youCopy.appearance}>
      <Section title={youCopy.appearance}>
        {THEMES.map(({ value, label, detail }) => (
          <Row
            key={value}
            role="radio"
            label={label}
            detail={detail}
            spoken={detail ? `${label}. ${detail}` : label}
            selected={preference === value}
            onPress={() => setPreference(value)}
            trailing={<ChoiceMarker selected={preference === value} />}
          />
        ))}
      </Section>
    </View>
  );
}

function Reminder() {
  const reminder = useReminderSetting();
  return (
    <View style={styles.group}>
      <Heading>{youCopy.reminder}</Heading>
      <ToggleRow
        label={youCopy.reminderSwitch}
        value={reminder.enabled}
        onChange={reminder.setEnabled}
        disabled={reminder.saving}
      />
      <Section>
        <Row
          label={youCopy.reminderTime}
          detail={reminder.timeText}
          hint={youCopy.reminderTimeHint}
          onPress={reminder.openPicker}
        />
      </Section>
      {reminder.blocked && (
        <Notice
          message={youCopy.reminderBlocked}
          actionLabel={youCopy.openSettings}
          onAction={reminder.openSettings}
        />
      )}
      {reminder.pickerSheet}
    </View>
  );
}

const lockMessage: Record<Exclude<LockNote, 'none' | 'checking'>, string> = {
  unavailable: youCopy.lockUnavailable,
  failed: youCopy.lockFailed,
};

function Privacy() {
  const lock = useLockSetting();
  const voice = useVoiceSetting();
  const label = Platform.OS === 'android' ? copy.privacy.lockAndroid : copy.privacy.lockIos;
  return (
    <View style={styles.group}>
      <Heading>{youCopy.privacy}</Heading>
      <ToggleRow
        label={label}
        value={lock.enabled}
        onChange={(next) => void lock.change(next)}
        disabled={lock.note === 'checking'}
      />
      {(lock.note === 'unavailable' || lock.note === 'failed') && (
        <Notice message={lockMessage[lock.note]} />
      )}
      <ToggleRow
        label={youCopy.voiceWords}
        value={voice.enabled}
        onChange={voice.change}
        hint={youCopy.voiceWordsDetail}
      />
      {voice.sheet}
      <Section>
        <Row label={youCopy.voiceWordsRow} detail={youCopy.voiceWordsDetail} />
        <Row label={youCopy.backup} detail={youCopy.backupDetail} />
        <Row label={youCopy.ai} detail={youCopy.aiDetail} />
      </Section>
    </View>
  );
}

function exportMessage(state: ExportState): string | null {
  if (state.kind === 'error')
    return state.code === 'unavailable' ? youCopy.exportUnavailable : youCopy.exportFailed;
  if (state.kind !== 'done') return null;
  const done = youCopy.exported(state.exported);
  return state.unreadable > 0 ? `${done} ${youCopy.exportSkipped(state.unreadable)}` : done;
}

function Data() {
  const exporting = useExport();
  const deleting = useDeleteAll();
  const message = exportMessage(exporting.state);
  const working = exporting.state.kind === 'working' || deleting.state === 'deleting';
  return (
    <View style={styles.group}>
      <Section title={youCopy.data}>
        <Row
          label={exporting.state.kind === 'working' ? youCopy.exporting : youCopy.export}
          detail={youCopy.exportDetail}
          busy={exporting.state.kind === 'working'}
          disabled={working}
          onPress={() => void exporting.run()}
        />
        <Row
          label={deleting.state === 'deleting' ? youCopy.deleting : youCopy.deleteAll}
          detail={youCopy.deleteAllDetail}
          busy={deleting.state === 'deleting'}
          disabled={working}
          destructive
          onPress={deleting.confirm}
        />
      </Section>
      {message && <Notice message={message} />}
      {deleting.state === 'error' && <Notice message={youCopy.deleteFailed} />}
    </View>
  );
}

function Support() {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.group}>
      <Section title={youCopy.support}>
        <Row
          label={youCopy.supportAction}
          detail={youCopy.supportDetail}
          onPress={() => void openSupport().then((opened) => setFailed(!opened))}
        />
      </Section>
      {failed && <Notice message={youCopy.supportFailed(SUPPORT_EMAIL)} />}
    </View>
  );
}

function About() {
  return (
    <View style={styles.group}>
      <Heading>{youCopy.about}</Heading>
      <OnPlate>
        {APP_VERSION ? (
          <EchoText variant="bodyM" color="textSecondary" style={onPlate}>
            {youCopy.version(APP_VERSION)}
          </EchoText>
        ) : null}
        <EchoText variant="bodyM" color="textSecondary" style={onPlate}>
          {youCopy.statement}
        </EchoText>
      </OnPlate>
    </View>
  );
}

/** Settings. Every action here shows that it is working and says so when it fails. */
export function YouScreen() {
  return (
    <TabPage title={youCopy.title}>
      <Appearance />
      <Reminder />
      <Privacy />
      <Data />
      <Support />
      <About />
    </TabPage>
  );
}

const styles = StyleSheet.create({ group: { gap: tokens.space[8] } });
