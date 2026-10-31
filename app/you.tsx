import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MotionToggle } from "@/components/MotionToggle";
import { MotionButton } from "@/components/MotionButton";
import { GlassCard } from "@/components/GlassCard";
import { JourneySheet } from "@/components/JourneySheet";
import { EchoIcon, type EchoIconName } from "@/components/EchoIcon";
import { TabScreen } from "@/components/TabScreen";
import { AvatarPicker } from "@/features/avatar/AvatarPicker";
import { AvatarPet } from "@/features/avatar/AvatarPet";
import { getAvatar } from "@/features/avatar/catalog";
import { useEchoTheme, type EchoThemeSetting } from "@/design/ThemeProvider";
import { tokens } from "@/design/tokens";
import { haptics } from "@/services/haptics";
import { deviceCapabilities } from "@/services/capabilities";
import { cancelDailyReminder, scheduleDailyReminder } from "@/services/notifications";
import { getJournalStorageKind } from "@/state/journal";
import { signOutAccount, useAuthSession } from "@/state/authSession";
import {
  REMINDER_PRESETS,
  setBiometricLockEnabled,
  setNotificationPermission,
  setPatternsEnabled,
  setReminderEnabled,
  setReminderTime,
  setVoiceSelection,
  setAvatarSelection,
  useOnboardingState,
  type VoiceSelection,
} from "@/state/onboardingSelections";

const MODES: { id: VoiceSelection; label: string; detail: string; icon: EchoIconName }[] = [
  { id: "guide_me", label: "A question", detail: "A gentle nudge to find your first words.", icon: "pen" },
  { id: "give_me_space", label: "Blank page", detail: "Room for whatever needs to come out.", icon: "book" },
  { id: "let_me_speak", label: "My voice", detail: "Speak freely. Keep the pauses, too.", icon: "mic" },
];
const APPEARANCES: { id: EchoThemeSetting; label: string; detail: string; icon: EchoIconName }[] = [
  { id: "automatic", label: "Automatic", detail: "Follow your device’s appearance.", icon: "sunrise" },
  { id: "day", label: "Day", detail: "A little more light.", icon: "sun" },
  { id: "night", label: "Night", detail: "A quieter atmosphere.", icon: "moon" },
];

type Panel = "appearance" | "beginning" | "avatar" | "reminder" | "privacy" | "account" | null;

export default function YouScreen() {
  const router = useRouter();
  const { setting, setSetting, theme } = useEchoTheme();
  const preferences = useOnboardingState((state) => state);
  const auth = useAuthSession();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signingOutRef = useRef(false);
  const operation = useRef(false);
  const storage = getJournalStorageKind();
  const primary = { color: theme.color.textPrimary };
  const secondary = { color: theme.color.textSecondary };
  const appearance = APPEARANCES.find((item) => item.id === setting)!;
  const beginning = MODES.find((item) => item.id === preferences.mode) ?? MODES[0]!;
  const avatar = getAvatar(preferences.avatarId);
  const privacyCopy = storage === "browser"
    ? "Your entries are encrypted and saved in this browser. They stay after a reload. Clearing this site’s data removes them. Cloud backup is not active."
    : storage === "memory"
      ? "This preview cannot keep entries after a reload. Use the mobile app for encrypted storage on your device."
      : "Your entries are encrypted and saved on this device. Cloud backup is not active. Removing the app or its data can remove your journal.";
  const openPanel = (next: Panel) => { haptics.light(); setPanel(next); };
  const signOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOutAccount();
      setPanel(null);
    } catch {
      setSignOutError("Sign-out did not finish. Your journal is still here. Please try again.");
    } finally {
      signingOutRef.current = false;
      setSigningOut(false);
    }
  };
  const reminder = async (
    enabled: boolean,
    time = preferences.reminder.localTime,
  ) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setNotice("");
    try {
      if (!enabled) {
        await cancelDailyReminder();
        setReminderEnabled(false);
        return;
      }
      const permission = await deviceCapabilities.notifications.request();
      setNotificationPermission(permission);
      if (permission !== "granted") {
        setReminderEnabled(false);
        setNotice(
          "Reminders need notification access in the mobile app. You can still return whenever you like.",
        );
        return;
      }
      const result = await scheduleDailyReminder(time);
      setReminderEnabled(result.status === "scheduled");
      setNotice(
        result.status === "scheduled"
          ? `A gentle reminder is set for ${time}.`
          : "The reminder could not be scheduled. Try again on your phone.",
      );
    } catch {
      setNotice("The reminder could not be changed. Please try again.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const lock = async (enabled: boolean) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await deviceCapabilities.biometrics.authenticate(
        enabled ? "Protect your journal" : "Turn off journal lock",
      );
      if (result === "success") setBiometricLockEnabled(enabled);
      else
        setNotice(
          "Journal lock needs enrolled biometrics on your phone. Your setting has not changed.",
        );
    } catch {
      setNotice("Journal lock could not be changed. Your current setting is unchanged.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <TabScreen tab="you" title="A space that fits you.">
        <Text style={[styles.intro, secondary]}>Your pace. Your rituals. Your kind of quiet.</Text>
        {auth.user ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage your account"
            onPress={() => { setSignOutError(null); openPanel("account"); }}
            style={({ pressed }) => [styles.account, pressed && styles.pressed]}
          >
            <View style={[styles.accountMark, { borderColor: theme.color.hairlineSoft }]}><EchoIcon name="user" color={theme.color.accentWarm} size={22} /></View>
            <View style={styles.rowWords}>
              <Text style={[styles.accountLabel, secondary]}>YOUR ACCOUNT</Text>
              <Text numberOfLines={1} style={[styles.rowLabel, primary]}>{auth.user.email ?? "Signed in"}</Text>
            </View>
            <Text style={[styles.chevron, secondary]}>›</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            onPress={() => { haptics.light(); router.push("/sign-in"); }}
            style={({ pressed }) => [styles.account, pressed && styles.pressed]}
          >
            <View style={[styles.accountMark, { borderColor: theme.color.hairlineSoft }]}><EchoIcon name="user" color={theme.color.accentWarm} size={22} /></View>
            <View style={styles.rowWords}>
              <Text style={[styles.accountLabel, secondary]}>YOUR SPACE, ON THIS DEVICE</Text>
              <Text style={[styles.rowLabel, primary]}>Sign in</Text>
            </View>
            <Text style={[styles.chevron, secondary]}>›</Text>
          </Pressable>
        )}
        <Text style={[styles.sectionLabel, secondary]}>MAKE IT YOURS</Text>
        <GlassCard padding={0} style={styles.group}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Echo Avatar, ${avatar.name}`} onPress={() => openPanel("avatar")} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.avatarIcon}><AvatarPet id={avatar.id} size={32} animated={false} /></View>
            <View style={styles.rowWords}><Text style={[styles.rowLabel, primary]}>Echo Avatar</Text></View>
            <Text style={[styles.rowValue, secondary]}>{avatar.name}</Text>
            <Text style={[styles.chevron, secondary]}>›</Text>
          </Pressable>
          <View style={styles.rule} />
          <PreferenceRow icon={appearance.icon} label="Atmosphere" value={appearance.label} onPress={() => openPanel("appearance")} />
          <View style={styles.rule} />
          <PreferenceRow icon={beginning.icon} label="How you begin" value={beginning.label} onPress={() => openPanel("beginning")} />
        </GlassCard>

        <Text style={[styles.sectionLabel, secondary]}>A LITTLE RHYTHM</Text>
        <GlassCard padding={0} style={styles.group}>
          <ToggleRow icon="bell" label="Daily reminder" detail="An invitation, never an obligation."
            control={<MotionToggle accessibilityLabel="Daily reminder" disabled={busy} value={preferences.reminder.enabled} onValueChange={(value) => void reminder(value)} />}
          />
          <View style={styles.rule} />
          <PreferenceRow label="Your quiet moment" value={formatTime(preferences.reminder.localTime)} onPress={() => openPanel("reminder")} compact />
        </GlassCard>

        <Text style={[styles.sectionLabel, secondary]}>ONLY ON YOUR TERMS</Text>
        <GlassCard padding={0} style={styles.group}>
          <ToggleRow icon="lock" label="Journal lock" detail="A private pause before opening."
            control={<MotionToggle accessibilityLabel="Journal lock" disabled={busy} value={preferences.privacy.biometricLockEnabled} onValueChange={(value) => void lock(value)} />}
          />
          <View style={styles.rule} />
          <ToggleRow icon="patterns" label="Local patterns" detail="Notice your rhythm, at your pace."
            control={<MotionToggle accessibilityLabel="Local patterns" value={preferences.patternsEnabled} onValueChange={setPatternsEnabled} />}
          />
        </GlassCard>

        <Pressable accessibilityRole="button" accessibilityLabel="About your private journal" onPress={() => openPanel("privacy")} style={({ pressed }) => [styles.privacy, pressed && styles.pressed]}>
          <EchoIcon name="lock" color={theme.color.accentWarm} size={18} />
          <View style={styles.privacyWords}>
            <Text style={[styles.privacyTitle, primary]}>Your words stay yours.</Text>
            <Text style={[styles.privacyNote, secondary]}>{storage === "browser" ? "Encrypted in this browser" : storage === "memory" ? "Temporary browser preview" : "Encrypted on this device"}</Text>
          </View>
          <Text style={[styles.chevron, secondary]}>›</Text>
        </Pressable>
        <Text style={[styles.signature, secondary]}>A little space to return to yourself.</Text>
      </TabScreen>

      <JourneySheet visible={panel === "avatar"} title="Echo Avatar" subtitle="Choose a little company, or keep your space quiet." onClose={() => setPanel(null)}>
        <AvatarPicker value={avatar.id} onSelect={setAvatarSelection} />
      </JourneySheet>
      <JourneySheet visible={panel === "appearance"} title="Set the atmosphere." subtitle="The same space, in a different light." onClose={() => setPanel(null)}>
        {APPEARANCES.map((item) => <ChoiceRow key={item.id} label={item.label} detail={item.detail} icon={item.icon} selected={setting === item.id} onPress={() => { haptics.light(); setSetting(item.id); }} />)}
      </JourneySheet>
      <JourneySheet visible={panel === "beginning"} title="Find your way in." subtitle="Choose where a new page begins. You can switch any time." onClose={() => setPanel(null)}>
        {MODES.map((item) => <ChoiceRow key={item.id} label={item.label} detail={item.detail} icon={item.icon} selected={preferences.mode === item.id} onPress={() => { haptics.light(); setVoiceSelection(item.id); }} />)}
      </JourneySheet>
      <JourneySheet visible={panel === "reminder"} title="A moment that’s yours." subtitle="Choose when to leave a little room for yourself. Times follow your phone’s local clock." onClose={() => setPanel(null)}>
        {REMINDER_PRESETS.map((preset) => <ChoiceRow key={preset.id} label={preset.label} detail={formatTime(preset.localTime)} icon={preset.id === "morning" ? "sunrise" : preset.id === "evening" ? "sun" : "moon"} selected={preferences.reminder.preset === preset.id} disabled={busy} onPress={() => {
          if (operation.current) return;
          haptics.light();
          setReminderTime(preset.localTime, preset.id);
          if (preferences.reminder.enabled) { setPanel(null); void reminder(true, preset.localTime); }
        }} />)}
        {!preferences.reminder.enabled ? <Text style={[styles.sheetNote, secondary]}>Your time is remembered. Turn on Daily reminder when you want a nudge.</Text> : null}
      </JourneySheet>
      <JourneySheet visible={panel === "privacy"} title="Your private journal." subtitle={privacyCopy} onClose={() => setPanel(null)}>
        <Text style={[styles.sheetNote, primary]}>Journal lock uses your phone’s biometrics when available. Local patterns are optional and stay on your device.</Text>
        <Text style={[styles.sheetNote, secondary]}>Sharing happens only when you choose it from a reading page. Audio is sent for transcription only after you explicitly ask.</Text>
      </JourneySheet>
      <JourneySheet
        visible={panel === "account"}
        title="Your account."
        subtitle={auth.user?.email ?? "You are signed in."}
        onClose={() => { if (!signingOutRef.current) setPanel(null); }}
      >
        <Text style={[styles.sheetNote, secondary]}>Signing out closes access to this journal. Your entries stay on this device. Sign in with this same account to return to them.</Text>
        <Text style={[styles.sheetNote, secondary]}>Being signed in does not enable cloud backup.</Text>
        {signOutError ? <Text accessibilityRole="alert" style={[styles.sheetNote, primary]}>{signOutError}</Text> : null}
        <MotionButton label={signingOut ? "Signing out…" : "Sign out of ECHO"} busy={signingOut} onPress={() => void signOut()} showArrow={false} />
      </JourneySheet>
      <JourneySheet visible={Boolean(notice)} title="A small note." subtitle={notice} onClose={() => setNotice("")}>
        <View />
      </JourneySheet>
    </>
  );
}

function PreferenceRow({ icon, label, value, onPress, compact = false }: { icon?: EchoIconName; label: string; value: string; onPress: () => void; compact?: boolean }) {
  const { theme } = useEchoTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} onPress={onPress} style={({ pressed }) => [styles.row, compact && styles.compactRow, pressed && styles.pressed]}>
    {icon ? <View style={styles.icon}><EchoIcon name={icon} color={theme.color.accentWarm} size={20} /></View> : null}
    <View style={styles.rowWords}><Text style={[styles.rowLabel, { color: theme.color.textPrimary }]}>{label}</Text></View>
    <Text style={[styles.rowValue, { color: theme.color.textSecondary }]}>{value}</Text>
    <Text style={[styles.chevron, { color: theme.color.textSecondary }]}>›</Text>
  </Pressable>;
}
function ToggleRow({ icon, label, detail, control }: { icon: EchoIconName; label: string; detail: string; control: ReactNode }) {
  const { theme } = useEchoTheme();
  return <View style={styles.row}>
    <View style={styles.icon}><EchoIcon name={icon} color={theme.color.accentWarm} size={20} /></View>
    <View style={styles.rowWords}><Text style={[styles.rowLabel, { color: theme.color.textPrimary }]}>{label}</Text><Text style={[styles.rowDetail, { color: theme.color.textSecondary }]}>{detail}</Text></View>
    {control}
  </View>;
}
function ChoiceRow({ label, detail, icon, selected, onPress, disabled = false }: { label: string; detail: string; icon: EchoIconName; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const { theme } = useEchoTheme();
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.choice, { borderColor: selected ? theme.color.accentWarm : theme.color.hairlineSoft, backgroundColor: selected ? theme.color.surfaceSelected : "transparent" }, pressed && styles.pressed]}>
    <EchoIcon name={icon} color={theme.color.accentWarm} size={24} />
    <View style={styles.rowWords}><Text style={[styles.rowLabel, { color: theme.color.textPrimary }]}>{label}</Text><Text style={[styles.choiceDetail, { color: theme.color.textSecondary }]}>{detail}</Text></View>
    <View style={[styles.choiceCircle, { backgroundColor: theme.color.surfaceSelected }]}>{selected ? <View style={[styles.choiceDot, { backgroundColor: theme.color.accentWarm }]} /> : null}</View>
  </Pressable>;
}
function formatTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour! % 12 || 12}:${String(minute).padStart(2, "0")} ${hour! < 12 ? "am" : "pm"}`;
}
const styles = StyleSheet.create({
  intro: { ...tokens.type.ui, fontSize: 12, lineHeight: 20, marginTop: -10, marginBottom: 8 },
  account: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 20, paddingBottom: 4 },
  accountMark: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  accountLabel: { ...tokens.type.uiMedium, fontSize: 8, lineHeight: 13, letterSpacing: 1.3, opacity: 0.7 },
  sectionLabel: { ...tokens.type.uiMedium, fontSize: 9, lineHeight: 15, letterSpacing: 1.6, marginTop: 28, marginBottom: 12, opacity: 0.8 },
  group: { borderColor: "rgba(244,239,229,0.23)", borderRadius: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 18, minHeight: 74 },
  compactRow: { minHeight: 58, paddingVertical: 15, paddingLeft: 56 },
  icon: { width: 28, alignItems: "center" },
  avatarIcon: { width: 28, alignItems: "center", justifyContent: "center" },
  rowWords: { flex: 1, gap: 5 },
  rowLabel: { ...tokens.type.uiMedium, fontSize: 13, lineHeight: 18 },
  rowValue: { ...tokens.type.ui, fontSize: 11, lineHeight: 17, maxWidth: 92, textAlign: "right", opacity: 0.8 },
  rowDetail: { ...tokens.type.ui, fontSize: 10, lineHeight: 16, opacity: 0.75 },
  chevron: { ...tokens.type.uiLight, fontSize: 24, lineHeight: 26, opacity: 0.55 },
  rule: { height: StyleSheet.hairlineWidth, opacity: 0, marginHorizontal: 16 },
  privacy: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 26, paddingHorizontal: 4 },
  privacyWords: { flex: 1, gap: 7 },
  privacyTitle: { ...tokens.type.displayItalic, fontSize: 22, lineHeight: 26 },
  privacyNote: { ...tokens.type.ui, fontSize: 10, lineHeight: 16, opacity: 0.75 },
  signature: { ...tokens.type.displayItalic, fontSize: 18, lineHeight: 25, textAlign: "center", opacity: 0.65, paddingTop: 12 },
  choice: { borderRadius: 18, minHeight: 84, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  choiceDetail: { ...tokens.type.ui, fontSize: 11, lineHeight: 18, opacity: 0.85 },
  choiceCircle: { height: 20, width: 20, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  choiceDot: { height: 10, width: 10, borderRadius: 5 },
  sheetNote: { ...tokens.type.ui, fontSize: 13, lineHeight: 21 },
  pressed: { opacity: 0.68 },
});
