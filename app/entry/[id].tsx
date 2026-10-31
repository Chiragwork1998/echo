import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppShell } from '@/components/AppShell';
import { ContentBackdrop } from '@/components/ContentBackdrop';
import { EchoBackground } from '@/components/EchoBackground';
import { EchoIcon } from '@/components/EchoIcon';
import { JourneySheet } from '@/components/JourneySheet';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { SecondaryButton } from '@/components/SecondaryButton';
import { screenBackgrounds, screenFocalPoints } from '@/design/backgrounds';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';
import { deleteJournalEntry, updateJournalEntry, useJournal } from '@/state/journal';
import { entryDate, wordCount } from '@/features/journal/prompts';
import { AudioPlayback } from '@/features/journal/AudioPlayback';
import { haptics } from '@/services/haptics';
import { registerWebHistoryGuard } from '@/navigation/webHistoryGuard';

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const entry = useJournal().find(item => item.id === id);
  const { name, theme } = useEchoTheme();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState('');
  const [takeaway, setTakeaway] = useState('');
  const [focusedInput, setFocusedInput] = useState<'body' | 'takeaway' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'save' | 'favorite' | 'delete' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveDestination, setLeaveDestination] = useState<'reader' | 'library'>('reader');
  const allowLeave = useRef(false);
  const pendingNavigation = useRef<NavigationAction | null>(null);
  const mutation = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const dirty = editing && (body !== (entry?.body ?? '') || takeaway !== (entry?.takeaway ?? ''));
  const available = entry?.contentState === 'available';
  const copyOnWeb = Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share;
  const primary = { color: theme.color.textPrimary };
  const muted = { color: theme.color.textSecondary };
  const content = { color: theme.color.textContent };
  const contentMuted = { color: theme.color.textContentSecondary };

  const back = useCallback(() => {
    if (busy) return;
    if (dirty) {
      pendingNavigation.current = null;
      setLeaveDestination('library');
      setLeaveOpen(true);
    } else router.dismissTo('/echoes');
  }, [busy, dirty, router]);

  usePreventRemove(dirty || Boolean(busy), ({ data }) => {
    if (allowLeave.current) { navigation.dispatch(data.action); return; }
    if (mutation.current) return;
    pendingNavigation.current = data.action;
    setLeaveDestination('library');
    setLeaveOpen(true);
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || (!dirty && !busy)) return;
    const currentUrl = window.location.href;
    const currentHistory = window.history.state;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    // SDK 57's web history reset bypasses the native removal guard. Intercept
    // browser Back before its bubble listener, retaining this editing session.
    const protectHistory = (event: PopStateEvent) => {
      if (allowLeave.current) return;
      event.stopImmediatePropagation();
      window.history.pushState(currentHistory, '', currentUrl);
      if (mutation.current) return;
      pendingNavigation.current = null;
      setLeaveDestination('library');
      setLeaveOpen(true);
    };
    window.addEventListener('beforeunload', preventUnload);
    const releaseHistoryGuard = registerWebHistoryGuard(protectHistory);
    return () => {
      window.removeEventListener('beforeunload', preventUnload);
      releaseHistoryGuard();
    };
  }, [dirty, busy]);

  const startEditing = () => {
    if (!entry || !available || busy) return;
    allowLeave.current = false;
    setBody(entry.body ?? '');
    setTakeaway(entry.takeaway ?? '');
    setFocusedInput(null);
    setEditing(true);
    setNotice('');
    setError('');
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const cancelEditing = () => {
    if (busy) return;
    if (dirty) { pendingNavigation.current = null; setLeaveDestination('reader'); setLeaveOpen(true); }
    else { setEditing(false); setError(''); }
  };

  const saveChanges = async () => {
    if (!entry || mutation.current) return;
    if (!body.trim() && !entry.audioPath) { setError('Keep a few words on this page, or delete the echo from More.'); return; }
    mutation.current = true;
    setBusy('save');
    setError('');
    try {
      await updateJournalEntry(entry.id, { body: body.trim() || null, takeaway: takeaway.trim() || null });
      setEditing(false);
      setNotice('Your changes are saved.');
      haptics.light();
    } catch { setError('Your changes could not be saved. They are still here. Try again.'); }
    finally { mutation.current = false; setBusy(null); }
  };

  const favorite = async () => {
    if (!entry || mutation.current || !available) return;
    mutation.current = true;
    setBusy('favorite');
    setError('');
    try {
      await updateJournalEntry(entry.id, { favorite: !entry.favorite });
      setNotice(entry.favorite ? 'Removed from favorites.' : 'Kept close. Find it in Favorites.');
      haptics.light();
    } catch { setError('That change did not save. Please try again.'); }
    finally { mutation.current = false; setBusy(null); }
  };

  const remove = async () => {
    if (!entry || mutation.current) return;
    mutation.current = true;
    setBusy('delete');
    setError('');
    try {
      await deleteJournalEntry(entry.id);
      allowLeave.current = true;
      setDeleteOpen(false);
      router.dismissTo('/echoes');
    } catch { setError('This echo could not be deleted. It is still in your library.'); }
    finally { mutation.current = false; setBusy(null); }
  };

  const share = async () => {
    if (!entry || !available) return;
    try {
      const message = `${entryDate(entry.createdAt)}\n\n${entry.promptTextSnapshot}\n\n${entry.body ?? ''}${entry.takeaway ? `\n\nTaking with me: ${entry.takeaway}` : ''}`;
      if (copyOnWeb) {
        await navigator.clipboard.writeText(message);
        setNotice('A copy of your words is on your clipboard.');
      } else await Share.share({ title: 'My echo', message });
      setMoreOpen(false);
    } catch { setError('Sharing is unavailable here. Your echo is still saved.'); }
  };

  const discardChanges = () => {
    if (busy) return;
    setLeaveOpen(false);
    setEditing(false);
    setError('');
    if (leaveDestination === 'library') {
      allowLeave.current = true;
      if (pendingNavigation.current) { navigation.dispatch(pendingNavigation.current); pendingNavigation.current = null; }
      else router.dismissTo('/echoes');
    }
  };

  return <>
    <Stack.Screen options={{ gestureEnabled: !editing }} />
    <AppShell theme={theme} background={<><EchoBackground fallbackColor={theme.color.textInk} focalPoint={screenFocalPoints.home} source={screenBackgrounds[name].home} /><View style={[StyleSheet.absoluteFill, { backgroundColor: name === 'day' ? 'rgba(5,16,30,0.42)' : 'rgba(5,16,30,0.24)' }]} /></>}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.nav}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to your echoes" disabled={Boolean(busy)} onPress={back} style={styles.navBack}>
            <Text style={[styles.backArrow, primary]}>‹</Text><Text style={[styles.navLabel, primary]}>Your echoes</Text>
          </Pressable>
          <Text style={[styles.navKicker, muted]}>{editing ? 'EDITING' : 'A PAGE OF YOU'}</Text>
          {entry && !editing ? <Pressable accessibilityRole="button" accessibilityLabel={entry.favorite ? 'Remove from favorites' : 'Add to favorites'} accessibilityState={{ selected: Boolean(entry.favorite), disabled: Boolean(busy) || !available }} disabled={Boolean(busy) || !available} onPress={() => void favorite()} style={styles.bookmarkButton}>
            <Svg width={20} height={24} viewBox="0 0 20 24"><Path d="M4 3h12v18l-6-4-6 4V3Z" fill={entry.favorite ? theme.color.accentWarm : 'none'} stroke={theme.color.accentWarm} strokeWidth={1.5} strokeLinejoin="round" /></Svg>
          </Pressable> : <View style={styles.bookmarkButton} />}
        </View>

        <ScrollView ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {entry ? <>
            <View style={[styles.paper, { borderColor: theme.color.borderGlass }]}>
              <ContentBackdrop />
              <View style={[styles.paperEdge, { borderColor: theme.color.textContentSecondary }]} />
              <View style={styles.dateRow}>
                <Text style={[styles.date, contentMuted]}>{new Date(entry.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
                <Text style={[styles.time, contentMuted]}>{new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
              <Text accessibilityRole="header" style={[styles.title, content]}>{entry.promptId === 'free_space' ? 'A little of today.' : entry.promptTextSnapshot}</Text>
              <View style={[styles.rule, { backgroundColor: theme.color.accentWarm }]} />
              {!available ? <Text style={[styles.body, content]}>This page could not be unlocked on this device. Its saved content has not been changed.</Text> : <>
                {editing ? <>
                  <Text style={[styles.editLabel, contentMuted]}>YOUR WORDS</Text>
                  <TextInput accessibilityLabel="Edit your journal entry" multiline textAlignVertical="top" value={body} onChangeText={setBody} editable={!busy} placeholder="Begin anywhere…" placeholderTextColor={theme.color.textContentSecondary} selectionColor={theme.color.textContent} onFocus={() => setFocusedInput('body')} onBlur={() => setFocusedInput(null)} underlineColorAndroid="transparent" style={[styles.body, styles.bodyInput, content, { backgroundColor: focusedInput === 'body' ? 'rgba(11,29,53,0.06)' : 'transparent' }]} />
                  <Text style={[styles.wordCount, contentMuted]}>{wordCount(body)} {wordCount(body) === 1 ? 'word' : 'words'}</Text>
                </> : entry.body ? <Text selectable style={[styles.body, content]}>{entry.body}</Text> : <Text style={[styles.voiceNote, content]}>Some things are easier to say.{"\n"}This moment is held in your voice.</Text>}
                {entry.audioPath && !editing ? <View style={styles.audio}><AudioPlayback path={entry.audioPath} id={entry.id} onPaper /></View> : null}
                {editing ? <View style={styles.takeaway}>
                  <Text style={[styles.editLabel, contentMuted]}>A THOUGHT TO KEEP · OPTIONAL</Text>
                  <TextInput accessibilityLabel="Edit your closing thought" value={takeaway} onChangeText={setTakeaway} multiline editable={!busy} maxLength={500} placeholder="What would you like to take with you?" placeholderTextColor={theme.color.textContentSecondary} selectionColor={theme.color.textContent} onFocus={() => setFocusedInput('takeaway')} onBlur={() => setFocusedInput(null)} underlineColorAndroid="transparent" style={[styles.takeawayInput, content, { backgroundColor: focusedInput === 'takeaway' ? 'rgba(11,29,53,0.06)' : 'transparent' }]} />
                </View> : entry.takeaway ? <View style={[styles.takeaway, styles.takeawayQuote, { borderLeftColor: theme.color.accentWarm }]}>
                  <Text style={[styles.editLabel, contentMuted]}>TAKING WITH ME</Text>
                  <Text selectable style={[styles.takeawayText, content]}>{entry.takeaway}</Text>
                </View> : null}
                {!editing && (entry.moodBefore || entry.moodAfter) ? <View style={[styles.moodJourney, { borderTopColor: theme.color.textContentSecondary }]}>
                  <View style={styles.moodItem}><Text style={[styles.editLabel, contentMuted]}>ARRIVING</Text><Text style={[styles.moodValue, content]}>{entry.moodBefore ?? 'Unrecorded'}</Text></View>
                  <View style={styles.moodArrow}><EchoIcon name="arrow-right" size={18} color={theme.color.textContentSecondary} /></View>
                  <View style={styles.moodItem}><Text style={[styles.editLabel, contentMuted]}>LEAVING</Text><Text style={[styles.moodValue, content]}>{entry.moodAfter ?? 'Unrecorded'}</Text></View>
                </View> : null}
                {!editing ? <Text style={[styles.paperEnd, contentMuted]}>{entry.body ? `${wordCount(entry.body)} ${wordCount(entry.body) === 1 ? 'word' : 'words'}` : 'A voice echo'} · A moment you made room for.</Text> : null}
              </>}
            </View>
            {error || notice ? <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.notice, { color: error ? theme.color.danger : theme.color.accentWarm }]}>{error || notice}</Text> : null}
            {!editing ? <Text style={[styles.endNote, muted]}>You were here. That matters.</Text> : <Text style={[styles.editHelp, muted]}>Your original page stays safe until you save.</Text>}
          </> : <View style={styles.missing}>
            <EchoIcon name="book" size={40} color={theme.color.accentWarm} />
            <Text style={[styles.missingTitle, primary]}>This page is no longer here.</Text>
            <Text style={[styles.editHelp, muted]}>Return to your echoes to find another moment.</Text>
            <PrimaryCTA label="Back to your echoes" onPress={() => router.dismissTo('/echoes')} />
          </View>}
        </ScrollView>

        {entry ? <View style={[styles.toolbar, { borderTopColor: theme.color.hairlineSoft }]}>
          {editing ? <>
            <SecondaryButton label="Cancel" variant="ghost" disabled={Boolean(busy)} onPress={cancelEditing} style={styles.toolbarSecondary} />
            <PrimaryCTA label={busy === 'save' ? 'Saving…' : 'Save changes'} disabled={Boolean(busy) || !dirty} onPress={() => void saveChanges()} style={styles.toolbarPrimary} />
          </> : <>
            <SecondaryButton label="More" onPress={() => { setError(''); setMoreOpen(true); }} disabled={Boolean(busy)} style={styles.toolbarSecondary} />
            <PrimaryCTA label="Edit this page" onPress={startEditing} disabled={Boolean(busy) || !available} style={styles.toolbarPrimary} />
          </>}
        </View> : null}
      </KeyboardAvoidingView>
    </AppShell>

    <JourneySheet visible={moreOpen} title="This moment is yours." subtitle="Keep it close, share a copy, or let it go." onClose={() => setMoreOpen(false)}>
      {entry?.body && available ? <SecondaryButton label={copyOnWeb ? "Copy these words" : "Share these words"} onPress={() => void share()} /> : null}
      <SecondaryButton label={entry?.favorite ? 'Remove from favorites' : 'Keep in favorites'} disabled={Boolean(busy) || !available} onPress={() => { void favorite(); setMoreOpen(false); }} />
      <Pressable accessibilityRole="button" onPress={() => { setMoreOpen(false); setDeleteOpen(true); }} style={styles.deleteButton}><Text style={[styles.deleteText, { color: theme.color.danger }]}>Delete this echo</Text></Pressable>
      {error ? <Text accessibilityRole="alert" style={[styles.editHelp, primary]}>{error}</Text> : null}
    </JourneySheet>
    <JourneySheet visible={deleteOpen} title="Let this echo go?" subtitle="This permanently deletes the page and its recording from this device. This cannot be undone." onClose={() => { if (!busy) setDeleteOpen(false); }}>
      <SecondaryButton label="Keep this echo" disabled={Boolean(busy)} onPress={() => setDeleteOpen(false)} />
      <Pressable accessibilityRole="button" accessibilityLabel="Permanently delete this echo" disabled={Boolean(busy)} onPress={() => void remove()} style={[styles.deleteButton, { borderRadius: 28 }]}><Text style={[styles.deleteText, { color: theme.color.danger }]}>{busy === 'delete' ? 'Deleting…' : 'Delete permanently'}</Text></Pressable>
      {error ? <Text accessibilityRole="alert" style={[styles.editHelp, primary]}>{error}</Text> : null}
    </JourneySheet>
    <JourneySheet visible={leaveOpen} title="Keep your changes?" subtitle="Your original echo is saved. These new edits have not been saved yet." onClose={() => setLeaveOpen(false)}>
      <PrimaryCTA label="Keep editing" onPress={() => setLeaveOpen(false)} />
      <SecondaryButton label="Discard changes" onPress={discardChanges} />
    </JourneySheet>
  </>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 60, gap: 8 },
  navBack: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 4, paddingRight: 8 },
  backArrow: { fontSize: 32, lineHeight: 36 },
  navLabel: { ...tokens.type.ui, fontSize: 12, lineHeight: 18 },
  navKicker: { ...tokens.type.uiMedium, flex: 1, fontSize: 9, letterSpacing: 1, textAlign: 'center' },
  bookmarkButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  paper: { zIndex: 0, borderRadius: 3, borderTopRightRadius: 20, borderBottomRightRadius: 20, paddingHorizontal: 28, paddingTop: 32, paddingBottom: 32, minHeight: 420, overflow: 'hidden' },
  paperEdge: { position: 'absolute', top: 0, bottom: 0, left: 7, opacity: 0 },
  dateRow: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 24 },
  date: { ...tokens.type.uiMedium, fontSize: 10, lineHeight: 16, flex: 1 },
  time: { ...tokens.type.ui, fontSize: 10, lineHeight: 16 },
  title: { ...tokens.type.displayMedium, fontSize: 36, lineHeight: 39 },
  rule: { width: 40, height: 1, marginTop: 24, marginBottom: 28, opacity: 0 },
  body: { ...tokens.type.ui, fontSize: 16, lineHeight: 28 },
  bodyInput: { minHeight: 240, borderWidth: 0, outlineWidth: 0, outlineStyle: 'solid', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 0 },
  wordCount: { ...tokens.type.ui, fontSize: 10, lineHeight: 16, marginTop: 8 },
  voiceNote: { ...tokens.type.displayItalic, fontSize: 25, lineHeight: 32 },
  audio: { marginTop: 28 },
  takeaway: { marginTop: 32 },
  takeawayQuote: { paddingLeft: 16 },
  editLabel: { ...tokens.type.uiMedium, fontSize: 9, lineHeight: 14, letterSpacing: 0.6 },
  takeawayInput: { ...tokens.type.display, fontSize: 24, lineHeight: 30, minHeight: 100, borderWidth: 0, outlineWidth: 0, outlineStyle: 'solid', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 0, textAlignVertical: 'top' },
  takeawayText: { ...tokens.type.displayItalic, fontSize: 28, lineHeight: 34, marginTop: 8 },
  moodJourney: { flexDirection: 'row', marginTop: 32, paddingTop: 20, alignItems: 'center', gap: 12 },
  moodItem: { flex: 1, gap: 6 },
  moodValue: { ...tokens.type.display, fontSize: 23, lineHeight: 28, textTransform: 'capitalize' },
  moodArrow: { marginRight: 12 },
  paperEnd: { ...tokens.type.ui, fontSize: 10, lineHeight: 17, marginTop: 32 },
  notice: { ...tokens.type.ui, fontSize: 12, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12, marginTop: 16 },
  endNote: { ...tokens.type.displayItalic, fontSize: 21, lineHeight: 28, textAlign: 'center', marginTop: 24, opacity: 0.75 },
  editHelp: { ...tokens.type.ui, fontSize: 12, lineHeight: 20, textAlign: 'center', marginTop: 16 },
  missing: { gap: 24, padding: 24, alignItems: 'center' },
  missingTitle: { ...tokens.type.display, fontSize: 32, lineHeight: 36, textAlign: 'center' },
  toolbar: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, alignItems: 'center' },
  toolbarSecondary: { width: 'auto', flex: 1 },
  toolbarPrimary: { width: 'auto', flex: 2 },
  deleteButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  deleteText: { ...tokens.type.uiMedium, fontSize: 14, lineHeight: 22 },
});
