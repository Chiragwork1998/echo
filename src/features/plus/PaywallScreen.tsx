import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoBackground } from '@/components/EchoBackground';
import { EchoText } from '@/components/EchoText';
import { BlurSurface, GlassCard } from '@/components/GlassCard';
import { OnboardingHeading } from '@/components/OnboardingHeading';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { links } from '@/config/links';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { notePaywallOpen } from '@/services/plus/engine';
import { markOffered, usePlusStore } from '@/services/plus/store';
import { HOME_PATH } from '@/state/routing';

import { PlanChoice, PlanMessage, PlanSkeleton } from './PlanChoice';
import { plusCopy } from './plusCopy';
import { ReadabilityScrim } from './ReadabilityScrim';
import { usePaywall, type PaywallNotice, type PaywallView } from './usePaywall';

// The heading sits where the safe area ends plus this, a little higher than onboarding's, which has
// a header above it. The actions end just above the home indicator, as onboarding's CTA does.
const TOP_GAP = 26;
const BOTTOM_GAP = 6;
const SMALL = { fontSize: 12.5, lineHeight: 17, letterSpacing: 0.1 } as const;

const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

function Benefits() {
  const { colors } = useTheme();
  return (
    <GlassCard radius={tokens.radius.medium}>
      <View style={styles.benefits}>
        {plusCopy.benefits.map(({ title, line }) => (
          <EchoText
            key={title}
            variant="bodyM"
            color="textSecondary"
            style={styles.benefit}
            maxFontSizeMultiplier={1.6}
          >
            <Text style={[styles.benefitTitle, { color: colors.textPrimary }]}>{`${title}. `}</Text>
            {line}
          </EchoText>
        ))}
      </View>
    </GlassCard>
  );
}

function Status() {
  const { trial, expiresAt, willRenew } = usePlusStore();
  const line =
    expiresAt === null
      ? null
      : trial && willRenew
        ? plusCopy.trialUntil(expiresAt)
        : willRenew
          ? plusCopy.renewsOn(expiresAt)
          : plusCopy.endsOn(expiresAt);
  return (
    <GlassCard radius={tokens.radius.medium}>
      <View style={styles.status} accessible accessibilityLiveRegion="polite">
        <EchoText variant="bodyL" serif style={styles.statusTitle}>
          {plusCopy.yours}
        </EchoText>
        {line && (
          <EchoText variant="bodyM" color="textSecondary">
            {line}
          </EchoText>
        )}
      </View>
    </GlassCard>
  );
}

function Notice({ notice }: { notice: PaywallNotice }) {
  return (
    <GlassCard radius={tokens.radius.medium} strength="strong">
      <View style={styles.notice} accessibilityLiveRegion="polite" testID="paywall-notice">
        <EchoText variant="bodyM" maxFontSizeMultiplier={1.6}>
          {notice.message}
        </EchoText>
      </View>
    </GlassCard>
  );
}

/** A quiet text control: a link to a page, a small action, or "Not now" in the label style. */
function TextButton({
  label,
  onPress,
  role = 'button',
  hint,
  disabled,
  caps,
}: {
  label: string;
  onPress: () => void;
  role?: 'button' | 'link';
  hint?: string;
  disabled?: boolean;
  caps?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.textButton, (pressed || disabled) && styles.pressed]}
    >
      {caps ? (
        <EchoText variant="label" maxFontSizeMultiplier={1.4}>
          {label.toUpperCase()}
        </EchoText>
      ) : (
        <EchoText variant="caption" color="textSecondary" style={SMALL} maxFontSizeMultiplier={1.6}>
          {label}
        </EchoText>
      )}
    </Pressable>
  );
}

function ctaLabel(view: PaywallView, trial: ReturnType<typeof usePaywall>['selected']): string {
  if (view.kind === 'offline' || view.kind === 'unavailable') return plusCopy.tryAgain;
  if (view.kind === 'plans' && trial?.trial) return plusCopy.start(trial.trial);
  return plusCopy.continue;
}

/**
 * ECHO Plus, full screen over the Home plate. Plans and prices come from the store; nothing is
 * written into the app. It is calm and plain on purpose: no countdown, no struck-out price, no
 * pressure, and "Not now" is always there. After onboarding it is shown once, and "Not now" goes
 * Home. From a Plus feature it closes back to where the person was.
 */
export function PaywallScreen() {
  const params = useLocalSearchParams<{ from?: string }>();
  const fromOnboarding = params.from === 'onboarding';
  const insets = useSafeAreaInsets();
  const { width, gutter, height } = useLayout();
  const paywall = usePaywall();
  const { view, selected, busy, notice } = paywall;

  const leave = () => {
    if (!fromOnboarding && router.canGoBack()) router.back();
    else router.replace(HOME_PATH as never);
  };

  useEffect(() => {
    notePaywallOpen(true);
    return () => notePaywallOpen(false);
  }, []);

  // Seen once, and never again: the offer that follows onboarding counts the moment it appears.
  useEffect(() => {
    if (fromOnboarding) markOffered();
  }, [fromOnboarding]);

  // After onboarding there is nothing behind this screen, so Back goes Home, as "Not now" does.
  useEffect(() => {
    if (!fromOnboarding) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace(HOME_PATH as never);
      return true;
    });
    return () => subscription.remove();
  }, [fromOnboarding]);

  const onCta = () => {
    if (view.kind === 'offline' || view.kind === 'unavailable') return paywall.retry();
    if (view.kind === 'plus') return leave();
    void paywall.buy();
  };

  const trial = view.kind === 'plans' && selected?.trial;
  const finePrint =
    view.kind !== 'plans'
      ? null
      : trial
        ? paywall.notifications
          ? plusCopy.finePrint
          : plusCopy.finePrintNoNotifications
        : plusCopy.finePrintNoTrial;

  return (
    <View style={styles.root}>
      <BlurSurface
        backdrop={
          <>
            <EchoBackground screen="home" />
            <ReadabilityScrim />
          </>
        }
      >
        <ScrollView
          testID="paywall-scroll"
          style={styles.fill}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            {
              minHeight: height,
              paddingTop: insets.top + TOP_GAP,
              paddingBottom: insets.bottom + BOTTOM_GAP,
            },
          ]}
        >
          <View style={[styles.column, { width, paddingHorizontal: gutter }]}>
            <OnboardingHeading title={plusCopy.heading} subtitle={plusCopy.lead} top={0} />
            <View style={styles.body}>
              <Benefits />
              {view.kind === 'loading' && <PlanSkeleton />}
              {view.kind === 'offline' && <PlanMessage message={plusCopy.offline} />}
              {view.kind === 'unavailable' && <PlanMessage message={plusCopy.unavailable} />}
              {view.kind === 'plans' && (
                <PlanChoice
                  plans={view.plans}
                  selectedId={selected?.id ?? null}
                  onChoose={paywall.choose}
                  disabled={busy !== null}
                />
              )}
              {view.kind === 'plus' && <Status />}
              {notice && <Notice notice={notice} />}
            </View>
            <View style={styles.spacer} />
            <View style={styles.actions}>
              <PrimaryCTA
                label={ctaLabel(view, selected)}
                onPress={onCta}
                loading={view.kind === 'loading' || busy === 'buying'}
                disabled={busy === 'restoring' || (view.kind === 'plans' && !selected)}
              />
              <View style={styles.finePrint}>
                {finePrint && (
                  <EchoText
                    variant="caption"
                    color="textSecondary"
                    align="center"
                    style={SMALL}
                    maxFontSizeMultiplier={1.6}
                  >
                    {finePrint}
                  </EchoText>
                )}
              </View>
              <View style={styles.links}>
                {view.kind !== 'plus' && (
                  <TextButton
                    label={busy === 'restoring' ? plusCopy.restoring : plusCopy.restore}
                    onPress={() => void paywall.restore()}
                    disabled={busy !== null}
                  />
                )}
                <TextButton
                  role="link"
                  label={plusCopy.terms}
                  hint={plusCopy.opensInBrowser}
                  onPress={() => open(links.terms)}
                />
                <TextButton
                  role="link"
                  label={plusCopy.privacy}
                  hint={plusCopy.opensInBrowser}
                  onPress={() => open(links.privacy)}
                />
              </View>
              {view.kind !== 'plus' && (
                <TextButton
                  label={plusCopy.notNow}
                  onPress={leave}
                  disabled={busy === 'buying'}
                  caps
                />
              )}
            </View>
          </View>
        </ScrollView>
      </BlurSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { flex: 1 },
  body: { marginTop: tokens.space[24], gap: tokens.space[16] },
  benefits: {
    paddingHorizontal: tokens.space[16],
    paddingVertical: tokens.space[16],
    gap: tokens.space[12],
  },
  benefit: { fontSize: 14, lineHeight: 20 },
  benefitTitle: { fontFamily: 'Inter_500Medium' },
  status: { padding: tokens.space[20], gap: tokens.space[4] },
  statusTitle: { fontSize: 22, lineHeight: 28 },
  notice: { paddingHorizontal: tokens.space[16], paddingVertical: tokens.space[12] },
  spacer: { flexGrow: 1, minHeight: tokens.space[24] },
  actions: { alignItems: 'center' },
  finePrint: { minHeight: 34, marginTop: tokens.space[12], justifyContent: 'center' },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: tokens.space[8],
    marginTop: tokens.space[4],
  },
  textButton: {
    minHeight: tokens.size.tapTarget,
    justifyContent: 'center',
    paddingHorizontal: tokens.space[8],
  },
  pressed: { opacity: 0.6 },
});
