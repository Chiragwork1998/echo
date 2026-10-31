import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View, type PanResponderGestureState } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { JourneySheet } from '@/components/JourneySheet';
import { MotionButton } from '@/components/MotionButton';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';
import { haptics } from '@/services/haptics';
import { CompanionError, getCompanionStatus, requestCompanionReply, type CompanionMessage } from '@/services/companion';
import { useAuthSession } from '@/state/authSession';
import { setCompanionPosition, useOnboardingState } from '@/state/onboardingSelections';
import { AvatarPet } from './AvatarPet';
import { getAvatar, type AvatarId } from './catalog';

const PET = 64;
/** Margin from the safe area; at the sides it keeps grabs out of the system back-swipe strips. */
const EDGE = 16;
type Spot = { x: number; y: number };
type Size = { width: number; height: number };

/** The pet can rest anywhere inside the safe area. */
function onScreen(spot: Spot, area: Size, insets: EdgeInsets): Spot {
  return {
    x: Math.max(insets.left + EDGE, Math.min(spot.x, area.width - insets.right - EDGE - PET)),
    y: Math.max(insets.top + EDGE, Math.min(spot.y, area.height - insets.bottom - EDGE - PET)),
  };
}

export function Companion() {
  const selection = useOnboardingState(state => state.avatarId);
  const avatarId = getAvatar(selection).id;
  if (avatarId === 'none') return null;
  return <ActiveCompanion key={avatarId} avatarId={avatarId} />;
}

function ActiveCompanion({ avatarId }: { avatarId: Exclude<AvatarId, 'none'> }) {
  const avatar = getAvatar(avatarId);
  const { theme } = useEchoTheme();
  const insets = useSafeAreaInsets();
  const auth = useAuthSession();
  const saved = useOnboardingState(state => state.companionPosition);
  const [area, setArea] = useState<Size | null>(null);
  const [pan] = useState(() => new Animated.ValueXY());
  const [grab] = useState(() => ({ start: { x: 0, y: 0 }, droppedAt: 0 }));
  const drag = useMemo(() => {
    if (!area) return null;
    const follow = (gesture: PanResponderGestureState) => {
      const spot = onScreen({ x: grab.start.x + gesture.dx, y: grab.start.y + gesture.dy }, area, insets);
      pan.setValue(spot);
      return spot;
    };
    const drop = (_: unknown, gesture: PanResponderGestureState) => {
      // Runs when the finger lifts, never during render.
      // eslint-disable-next-line react-hooks/immutability, react-hooks/purity
      grab.droppedAt = Date.now();
      setCompanionPosition(follow(gesture));
    };
    return PanResponder.create({
      // Within the slop it is still a tap; past it the drag takes over from the Pressable.
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8,
      onPanResponderGrant: () => pan.stopAnimation(value => { grab.start = value; }),
      onPanResponderMove: (_, gesture) => { follow(gesture); },
      onPanResponderRelease: drop,
      onPanResponderTerminate: drop,
    });
  }, [area, grab, insets, pan]);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState<'checking' | 'ready' | 'unavailable' | 'signin'>('checking');
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);

  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    void getCompanionStatus(controller.signal).then(status => {
      if (!active) return;
      setConnection(!status.available ? 'unavailable' : status.requiresSignIn && auth.status !== 'signed-in' ? 'signin' : 'ready');
    }).catch(() => { if (active) setConnection('unavailable'); });
    return () => { active = false; controller.abort(); };
  }, [open, auth.status]);

  const send = async () => {
    const text = draft.trim();
    if (!text || text.length > 1200 || inFlight.current || connection === 'signin' || connection === 'checking') return;
    inFlight.current = true;
    setBusy(true);
    setNotice('');
    const controller = new AbortController();
    request.current = controller;
    const next: CompanionMessage[] = [...messages, { role: 'user', content: text }];
    try {
      const response = await requestCompanionReply(avatarId, next, controller.signal);
      if (controller.signal.aborted) return;
      setMessages([...next, { role: 'assistant', content: response.reply }]);
      setDraft('');
      setConnection('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof CompanionError && error.code === 'sign_in_required') setConnection('signin');
      setNotice(error instanceof CompanionError ? error.message : 'Your companion could not reply just now. Your message is still here.');
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
    }
  };

  const connectionText = connection === 'checking' ? 'Opening a little space…' : connection === 'signin' ? 'Sign in from You to talk with your companion.' : connection === 'unavailable' ? 'Your companion is not connected just now. You can try sending again.' : 'A little company, at your pace.';

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, styles.stage]}
        onLayout={({ nativeEvent: { layout } }) => {
          pan.setValue(onScreen(saved ?? { x: layout.width - EDGE - PET, y: layout.height - 80 - insets.bottom - PET }, layout, insets));
          setArea({ width: layout.width, height: layout.height });
        }}
      >
        {drag ? (
          <Animated.View pointerEvents="box-none" style={[styles.dock, { transform: pan.getTranslateTransform() }]}>
            <View {...drag.panHandlers}>
              <Pressable
                accessibilityLabel={`Talk with ${avatar.name}`}
                accessibilityHint="Open your Echo companion. Only messages you choose to send are shared."
                accessibilityRole="button"
                // Web: keep mouse moves on the pet even if a fast drag outruns it.
                onPointerDown={Platform.OS === 'web' ? event => (event.currentTarget as unknown as Element).setPointerCapture(event.nativeEvent.pointerId) : undefined}
                onPress={() => {
                  // ponytail: web turns the mouseup that ends a drag into a click; taps within 300 ms of a drop are ignored.
                  if (Date.now() - grab.droppedAt < 300) return;
                  haptics.light(); setConnection('checking'); setOpen(true);
                }}
                style={({ pressed }) => [styles.launcher, pressed && styles.pressed]}
              >
                <AvatarPet id={avatarId} size={48} animated mood={busy ? 'thinking' : 'idle'} />
              </Pressable>
            </View>
          </Animated.View>
        ) : null}
      </View>

      <JourneySheet visible={open} title="A little company." onClose={() => setOpen(false)}>
        <View style={styles.companionHeader}>
          <AvatarPet id={avatarId} size={58} animated mood={busy ? 'thinking' : 'idle'} />
          <View style={styles.headerWords}>
            <Text style={[styles.petName, { color: theme.color.textPrimary }]}>{avatar.name}</Text>
            <Text style={[styles.small, { color: theme.color.textSecondary }]}>{connectionText}</Text>
          </View>
        </View>
        <Text style={[styles.privacy, { color: theme.color.textSecondary }]}>Only what you send is shared. Your journal stays private. This conversation is temporary.</Text>
        {messages.length ? (
          <View style={styles.conversation}>
            {messages.map((message, index) => (
              <View key={index} style={[styles.message, { backgroundColor: message.role === 'user' ? theme.color.surfaceSelected : theme.color.surfaceGlass }]}>
                <Text style={[styles.speaker, { color: theme.color.accentWarm }]}>{message.role === 'user' ? 'YOU' : avatar.name.toUpperCase()}</Text>
                <Text selectable accessibilityLiveRegion={index === messages.length - 1 ? 'polite' : 'none'} style={[styles.messageText, { color: theme.color.textPrimary }]}>{message.content}</Text>
              </View>
            ))}
          </View>
        ) : <Text style={[styles.opening, { color: theme.color.textPrimary }]}>A thought. A question. Something small you want to say.</Text>}
        {busy ? <View accessibilityLiveRegion="polite" style={styles.thinking}><ActivityIndicator size="small" color={theme.color.accentWarm} /><Text style={[styles.small, { color: theme.color.textSecondary }]}>{avatar.name} is thinking…</Text></View> : null}
        <TextInput
          accessibilityLabel="Message your Echo companion"
          placeholder="What’s on your mind?"
          placeholderTextColor={theme.color.textSecondary}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={1200}
          editable={!busy && connection !== 'signin'}
          underlineColorAndroid="transparent"
          selectionColor={theme.color.accentWarm}
          style={[styles.input, { color: theme.color.textPrimary, backgroundColor: theme.color.surfaceSelected }]}
        />
        {notice ? <Text accessibilityRole="alert" style={[styles.small, { color: theme.color.textSecondary }]}>{notice}</Text> : null}
        <MotionButton label={busy ? 'One moment…' : notice ? 'Try sending again' : 'Send'} busy={busy} disabled={!draft.trim() || busy || connection === 'signin' || connection === 'checking'} onPress={() => void send()} />
        {messages.length ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setMessages([]); setNotice(''); }} style={styles.clear}><Text style={[styles.small, { color: theme.color.textSecondary }]}>Clear conversation</Text></Pressable> : null}
      </JourneySheet>
    </>
  );
}

const styles = StyleSheet.create({
  stage: { zIndex: 30 },
  dock: { position: 'absolute', left: 0, top: 0 },
  // No tile: only the pet shows. Not selectable, so a web drag cannot start a text selection.
  launcher: { width: PET, height: PET, alignItems: 'center', justifyContent: 'center', userSelect: 'none' },
  companionHeader: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  headerWords: { flex: 1, gap: 6 },
  petName: { ...tokens.type.display, fontSize: 27, lineHeight: 31 },
  small: { ...tokens.type.ui, fontSize: 12, lineHeight: 19 },
  privacy: { ...tokens.type.ui, fontSize: 10, lineHeight: 16, opacity: 0.85 },
  conversation: { gap: 10 },
  message: { borderRadius: 16, padding: 14, gap: 8 },
  speaker: { ...tokens.type.uiMedium, fontSize: 9, lineHeight: 13, letterSpacing: 1 },
  messageText: { ...tokens.type.ui, fontSize: 14, lineHeight: 22 },
  opening: { ...tokens.type.displayItalic, fontSize: 23, lineHeight: 29, paddingVertical: 8 },
  thinking: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  input: { ...tokens.type.ui, fontSize: 14, lineHeight: 22, minHeight: 96, maxHeight: 180, padding: 15, borderRadius: 16, textAlignVertical: 'top', borderWidth: 0, outlineStyle: 'solid', outlineWidth: 0 },
  clear: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
});
