import { useState, type PropsWithChildren } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceMarker } from '@/components/ChoiceMarker';
import { EchoText } from '@/components/EchoText';
import { Icon } from '@/components/Icon';
import { links } from '@/config/links';
import { copy } from '@/content/copy';
import { useTheme, type ThemePreference } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { PlusSection } from '@/features/plus/PlusSection';
import { Heading, Notice, Row, Section, Surface, SwitchRow } from '@/features/tab-pages/parts';
import { TabPage } from '@/features/tab-pages/TabPage';
import { keepTogether } from '@/features/tab-pages/keepTogether';
import { detail, runIn } from '@/features/tab-pages/textStyles';

import { APP_VERSION, openPage, openSupport, SUPPORT_EMAIL } from './support';
import { SupportSheet } from './SupportSheet';
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

/** A section and whatever it needs to say beneath its glass. */
function Group({ children }: PropsWithChildren) {
  return <View style={styles.group}>{children}</View>;
}

function Appearance() {
  const { preference, setPreference } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={youCopy.appearance}>
      <Section title={youCopy.appearance}>
        {THEMES.map(({ value, label, detail: line }) => (
          <Row
            key={value}
            role="radio"
            label={label}
            detail={line}
            spoken={line ? `${label}. ${line}` : label}
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
    <Group>
      <Section title={youCopy.reminder}>
        <SwitchRow
          label={youCopy.reminderSwitch}
          value={reminder.enabled}
          onChange={reminder.setEnabled}
          disabled={reminder.saving}
        />
        <Row
          label={youCopy.reminderTime}
          value={reminder.timeText}
          hint={youCopy.reminderTimeHint}
          onPress={reminder.openPicker}
          chevron
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
    </Group>
  );
}

const lockMessage: Record<Exclude<LockNote, 'none' | 'checking'>, string> = {
  unavailable: youCopy.lockUnavailable,
  failed: youCopy.lockFailed,
};

const EXPLAINED = [
  { name: youCopy.voiceWords, text: youCopy.voiceWordsDetail },
  { name: youCopy.tidyWords, text: youCopy.tidyWordsDetail },
] as const;

/**
 * "About this": the privacy choices' longer explanations, opened when wanted, so the list stays a
 * list. Each one is led by the name of its choice.
 */
function AboutThis() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={youCopy.aboutThis}
        accessibilityHint={youCopy.aboutThisHint}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((now) => !now)}
        style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}
      >
        <EchoText variant="bodyM" color="textSecondary" style={[detail, styles.fill]}>
          {youCopy.aboutThis}
        </EchoText>
        <View style={{ transform: [{ rotate: open ? '270deg' : '90deg' }] }}>
          <Icon name="arrow-right" size={16} color={colors.textSecondary} />
        </View>
      </Pressable>
      {open && (
        <View style={styles.explained}>
          {EXPLAINED.map(({ name, text }) => (
            <EchoText
              key={name}
              variant="bodyM"
              color="textSecondary"
              style={detail}
              maxFontSizeMultiplier={1.6}
            >
              <Text style={[runIn, { color: colors.textPrimary }]}>{`${name}. `}</Text>
              {keepTogether(text)}
            </EchoText>
          ))}
        </View>
      )}
    </View>
  );
}

function Privacy() {
  const lock = useLockSetting();
  const voice = useVoiceSetting();
  const label = Platform.OS === 'android' ? copy.privacy.lockAndroid : copy.privacy.lockIos;
  return (
    <Group>
      <Section title={youCopy.privacy}>
        <SwitchRow
          label={label}
          value={lock.enabled}
          onChange={(next) => void lock.change(next)}
          disabled={lock.note === 'checking'}
        />
        <SwitchRow
          label={youCopy.voiceWords}
          value={voice.enabled}
          onChange={voice.change}
          hint={youCopy.voiceWordsDetail}
        />
        <SwitchRow
          label={youCopy.tidyWords}
          value={voice.tidy}
          onChange={voice.changeTidy}
          hint={youCopy.tidyWordsDetail}
        />
        <AboutThis />
      </Section>
      {(lock.note === 'unavailable' || lock.note === 'failed') && (
        <Notice message={lockMessage[lock.note]} />
      )}
      {voice.sheet}
    </Group>
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
    <Group>
      <Section title={youCopy.data}>
        <Row
          label={exporting.state.kind === 'working' ? youCopy.exporting : youCopy.export}
          detail={youCopy.exportDetail}
          busy={exporting.state.kind === 'working'}
          disabled={working}
          onPress={() => void exporting.run()}
        />
        {/*
          Restore from a backup: its own agent builds it as one self-contained row, and it goes here,
          between keeping a copy and deleting everything.
        */}
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
    </Group>
  );
}

type SupportNote = { kind: 'email' } | { kind: 'page'; url: string } | null;

function Support() {
  const [note, setNote] = useState<SupportNote>(null);
  const [struggling, setStruggling] = useState(false);
  const page = (url: string) =>
    void openPage(url).then((opened) => setNote(opened ? null : { kind: 'page', url }));
  return (
    <Group>
      <Section title={youCopy.support}>
        <Row
          label={youCopy.struggling}
          detail={youCopy.strugglingDetail}
          onPress={() => setStruggling(true)}
          chevron
        />
        <Row
          label={youCopy.supportAction}
          detail={youCopy.supportDetail}
          onPress={() =>
            void openSupport().then((opened) => setNote(opened ? null : { kind: 'email' }))
          }
          chevron
        />
        <Row
          label={youCopy.privacyPolicy}
          role="link"
          onPress={() => page(links.privacy)}
          chevron
        />
        <Row label={youCopy.terms} role="link" onPress={() => page(links.terms)} chevron />
      </Section>
      {note?.kind === 'email' && <Notice message={youCopy.supportFailed(SUPPORT_EMAIL)} />}
      {note?.kind === 'page' && <Notice message={youCopy.pageFailed(note.url)} />}
      <SupportSheet visible={struggling} onClose={() => setStruggling(false)} />
    </Group>
  );
}

function About() {
  return (
    <Group>
      <Heading>{youCopy.about}</Heading>
      <Surface>
        <View style={styles.about}>
          {APP_VERSION ? (
            <EchoText variant="bodyM" maxFontSizeMultiplier={1.6}>
              {youCopy.version(APP_VERSION)}
            </EchoText>
          ) : null}
          <EchoText
            variant="bodyM"
            color="textSecondary"
            style={detail}
            maxFontSizeMultiplier={1.6}
          >
            {keepTogether(youCopy.statement)}
          </EchoText>
          <EchoText
            variant="bodyM"
            color="textSecondary"
            style={detail}
            maxFontSizeMultiplier={1.6}
          >
            {keepTogether(youCopy.breatheVoice)}
          </EchoText>
        </View>
      </Surface>
    </Group>
  );
}

/**
 * Settings, in a few calm groups, each one piece of glass with hairlines between its rows. Every
 * action here shows that it is working and says so when it fails.
 */
export function YouScreen() {
  return (
    <TabPage title={youCopy.title}>
      <View style={styles.groups}>
        <PlusSection />
        <Appearance />
        <Reminder />
        <Privacy />
        <Data />
        <Support />
        <About />
      </View>
    </TabPage>
  );
}

const styles = StyleSheet.create({
  groups: { gap: tokens.space[32] },
  group: { gap: tokens.space[12] },
  disclosure: {
    minHeight: tokens.size.tapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
    paddingHorizontal: tokens.space[16],
    paddingVertical: tokens.space[12],
  },
  fill: { flex: 1 },
  pressed: { opacity: 0.66 },
  explained: {
    gap: tokens.space[12],
    paddingHorizontal: tokens.space[16],
    paddingBottom: tokens.space[16],
  },
  about: { gap: tokens.space[8], padding: tokens.space[16] },
});
