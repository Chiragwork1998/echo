import {
  Children,
  Fragment,
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { OnGlass } from '@/components/arrival';
import { EchoText } from '@/components/EchoText';
import { GlassBlur } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { SoftScrim } from '@/components/SoftScrim';
import { SwitchTrack } from '@/components/SwitchTrack';
import { TideLine } from '@/components/TideLine';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { keepTogether } from './keepTogether';
import { pageCopy } from './pageCopy';
import { Bars, useIsArriving } from './Resolve';
import { Reveal } from './Reveal';
import { detail as detailText, groupTitle, onPlate, textAction } from './textStyles';

const ROW_PADDING = tokens.space[16];
/** Hairlines between rows: the theme's own ink, faint, so the group reads as one surface. */
const RULE_OPACITY = 0.16;

// The same soft local patch the Privacy step puts behind its notes. Day's snow and clouds are
// brighter, so its patch is stronger (docs/SPEC_CONFLICTS.md, C-05: no global scrim).
const SCRIM_ALPHA = { day: 0.36, night: 0.3 } as const;
const SCRIM_INSET = { x: 34, y: 14 };
// Behind a few words that hug their patch: lighter and wider, so it reads as shade, never as a smudge.
const HUG_ALPHA = { day: 0.24, night: 0.2 } as const;
const HUG_INSET = { x: 44, y: 20 };

// Day's snow and cloud are bright, so cream type there leans on the deeper, wider shadow the daily
// session gives its words on the sky (src/features/journal-session/sky.ts).
const DAY_PLATE_TEXT: TextStyle = {
  textShadowColor: 'rgba(8,28,58,0.62)',
  textShadowRadius: 9,
  textShadowOffset: { width: 0, height: 1 },
};

/** The shadow for cream type set straight on the plate, in this theme. */
export function usePlateText(): TextStyle {
  const { name } = useTheme();
  return name === 'day' ? DAY_PLATE_TEXT : onPlate;
}

/**
 * Keeps text set straight on the photograph legible, with a feathered patch behind it. `hug` keeps
 * the patch to the words themselves, so it reads as shade behind them and never as a band across.
 */
export function OnPlate({ children, hug }: PropsWithChildren<{ hug?: 'flex-start' | 'center' }>) {
  const { name } = useTheme();
  return (
    <View style={hug ? { alignSelf: hug } : undefined}>
      <View pointerEvents="none" style={hug ? styles.hug : styles.scrim}>
        <SoftScrim alpha={(hug ? HUG_ALPHA : SCRIM_ALPHA)[name]} />
      </View>
      {children}
    </View>
  );
}

function useReduceTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/**
 * The pages' glass: the handoff's blur, scrim and fine white edge, with no drop shadow under it
 * (docs/DESIGN_QUALITY.md, Never). With Reduce Transparency it is the strong scrim, unblurred.
 */
export function Surface({
  strength = 'regular',
  radius = tokens.radius.medium,
  tint,
  style,
  children,
}: PropsWithChildren<{
  strength?: 'regular' | 'strong';
  radius?: number;
  /** A faint colour over the glass, as Completion's reflection card warms its own. */
  tint?: string;
  style?: StyleProp<ViewStyle>;
}>) {
  const { colors } = useTheme();
  const reduced = useReduceTransparency();
  const strong = strength === 'strong' || reduced;
  return (
    <View
      style={[styles.surface, { borderRadius: radius, borderColor: colors.borderGlass }, style]}
    >
      {!reduced && (
        <GlassBlur radius={strength === 'strong' ? tokens.blur.glassStrong : tokens.blur.glass} />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: strong ? colors.surfaceGlassStrong : colors.surfaceGlass },
        ]}
      />
      {tint && !reduced ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      ) : null}
      <OnGlass>{children}</OnGlass>
    </View>
  );
}

/**
 * The name of a group, set in Cormorant on the plate, in sentence case, the way Home names
 * "From your path". Never a row of tracked capitals.
 */
export function Heading({ children }: { children: string }) {
  const { name } = useTheme();
  const shadow = usePlateText();
  return (
    <OnPlate hug="flex-start">
      <EchoText
        variant="bodyL"
        accessibilityRole="header"
        accessibilityLabel={children}
        maxFontSizeMultiplier={1.5}
        // A little more weight by Day, as the session's words have on the bright sky.
        style={[groupTitle, name === 'day' && styles.dayTitle, shadow]}
      >
        {keepTogether(children)}
      </EchoText>
    </OnPlate>
  );
}

/** A hairline between the parts of one surface. */
export function Rule({ inset = ROW_PADDING }: { inset?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.rule,
        { marginHorizontal: inset, backgroundColor: colors.textPrimary, opacity: RULE_OPACITY },
      ]}
    />
  );
}

/** A group's rows on one piece of glass, with hairlines between them. No decoration. */
export function Section({ title, children }: PropsWithChildren<{ title?: string }>) {
  const rows = Children.toArray(children);
  return (
    <View style={styles.section}>
      {title ? <Heading>{title}</Heading> : null}
      <Surface>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && <Rule />}
            {row}
          </Fragment>
        ))}
      </Surface>
    </View>
  );
}

type RowProps = {
  label: string;
  detail?: string;
  /** A short value set at the end of the row, such as a time. */
  value?: string;
  /** Without onPress the row is read-only text. */
  onPress?: () => void;
  role?: 'button' | 'radio' | 'link';
  selected?: boolean;
  busy?: boolean;
  disabled?: boolean;
  hint?: string;
  trailing?: ReactNode;
  /** A small chevron: this row opens something. */
  chevron?: boolean;
  /** What a screen reader says, when the visible text alone would leave something out. */
  spoken?: string;
};

/** One line of a Section: a label, an optional detail, and at most one control. 52 pt or taller. */
export function Row({
  label,
  detail,
  value,
  onPress,
  role = 'button',
  selected,
  busy,
  disabled,
  hint,
  trailing,
  chevron,
  spoken: override,
}: RowProps) {
  const { colors } = useTheme();
  const extra = detail ?? value;
  const spoken = override ?? (extra && role !== 'radio' ? `${label}. ${extra}` : label);
  const body = (
    <View style={styles.row}>
      <View style={[styles.text, busy && styles.working]}>
        {/* Even a row that deletes is set in the page's ink, never orange (D-013): its dialog
            carries the weight. */}
        <EchoText variant="bodyM" maxFontSizeMultiplier={1.6}>
          {label}
        </EchoText>
        {detail ? (
          <EchoText
            variant="bodyM"
            color="textSecondary"
            style={detailText}
            maxFontSizeMultiplier={1.6}
          >
            {keepTogether(detail)}
          </EchoText>
        ) : null}
      </View>
      {value ? (
        <EchoText
          variant="bodyM"
          color="textSecondary"
          style={detailText}
          maxFontSizeMultiplier={1.6}
        >
          {value}
        </EchoText>
      ) : null}
      {trailing}
      {chevron && !busy ? <Icon name="arrow-right" size={16} color={colors.textSecondary} /> : null}
      {/* Working is said by a hairline of warm light along the row's own rule, and in words by its
          label (the row says what it is doing). No spinner. */}
      {busy ? <TideLine inset={ROW_PADDING} /> : null}
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={override ?? (extra ? `${label}. ${extra}` : label)}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      accessibilityState={
        role === 'radio'
          ? { selected, checked: selected, disabled }
          : { disabled: disabled || busy, busy }
      }
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}
    >
      {body}
    </Pressable>
  );
}

type SwitchRowProps = {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  detail?: string;
  disabled?: boolean;
  /** Read by screen readers, for example what turning it on does. */
  hint?: string;
};

/** A switch as one row of a Section, so a group of settings shares one surface. */
export function SwitchRow({
  label,
  value,
  onChange,
  detail,
  disabled = false,
  hint,
}: SwitchRowProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}
    >
      {({ pressed }) => (
        <View style={styles.row}>
          <View style={styles.text}>
            <EchoText variant="bodyM" maxFontSizeMultiplier={1.6}>
              {label}
            </EchoText>
            {detail ? (
              <EchoText
                variant="bodyM"
                color="textSecondary"
                style={detailText}
                maxFontSizeMultiplier={1.6}
              >
                {keepTogether(detail)}
              </EchoText>
            ) : null}
          </View>
          <SwitchTrack value={value} pressed={pressed} />
        </View>
      )}
    </Pressable>
  );
}

/** A quiet word to tap, at least 44 pt tall. Sentence case, in the page's ink. */
export function TextAction({
  label,
  onPress,
  spoken,
  hint,
  tone = 'textPrimary',
  role = 'button',
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  /** What a screen reader says, when it should say more than the visible word. */
  spoken?: string;
  hint?: string;
  tone?: 'textPrimary' | 'textSecondary' | 'danger';
  role?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={spoken ?? label}
      accessibilityHint={hint}
      onPress={onPress}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [styles.action, style, pressed && styles.pressed]}
    >
      <EchoText variant="bodyM" color={tone} style={textAction} maxFontSizeMultiplier={1.6}>
        {label}
      </EchoText>
    </Pressable>
  );
}

/** An inline message that never replaces the page. Announced politely when it appears. */
export function Notice({
  message,
  actionLabel = pageCopy.retry,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  // Inside a page that is itself arriving, the page's arrival is the notice's.
  const arriving = useIsArriving();
  return (
    <Reveal duration={tokens.motion.standard} skip={arriving}>
      <Surface strength="strong">
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <EchoText variant="bodyM" style={[detailText, styles.text]} maxFontSizeMultiplier={1.6}>
            {keepTogether(message)}
          </EchoText>
          {onAction ? <TextAction label={actionLabel} onPress={onAction} /> : null}
        </View>
      </Surface>
    </Reveal>
  );
}

/** A short note on glass, left aligned, for states that need a sentence and nothing else. */
export function Quiet({ children }: { children: string }) {
  return (
    <Surface>
      <View style={styles.quiet} accessible accessibilityLiveRegion="polite">
        <EchoText
          variant="bodyM"
          color="textSecondary"
          style={detailText}
          maxFontSizeMultiplier={1.6}
        >
          {keepTogether(children)}
        </EchoText>
      </View>
    </Surface>
  );
}

/** A bar standing in for a line of text while it loads. */
export function SkeletonLine({
  width,
  height = 10,
  style,
}: {
  width: ViewStyle['width'];
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.bar, { width, height, borderRadius: height / 2 }, style]} />;
}

/**
 * A loading state shaped like what is coming. It says what it is waiting for to a screen reader
 * from the first moment, and nothing in it moves: the bars arrive by opacity only if the wait
 * outlasts a quarter of a second (a local read rarely does), so a quick answer never flashes them.
 */
export function Loading({
  label,
  immediate,
  children,
}: PropsWithChildren<{ label: string; immediate?: boolean }>) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
    >
      <Bars immediate={immediate}>{children}</Bars>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: -SCRIM_INSET.x,
    right: -SCRIM_INSET.x,
    top: -SCRIM_INSET.y,
    bottom: -SCRIM_INSET.y,
  },
  hug: {
    position: 'absolute',
    left: -HUG_INSET.x,
    right: -HUG_INSET.x,
    top: -HUG_INSET.y,
    bottom: -HUG_INSET.y,
  },
  surface: { overflow: 'hidden', borderWidth: 1 },
  dayTitle: { fontFamily: 'CormorantGaramond_500Medium' },
  section: { gap: tokens.space[12] },
  rule: { height: StyleSheet.hairlineWidth },
  row: {
    minHeight: tokens.size.tapTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
    paddingHorizontal: ROW_PADDING,
    paddingVertical: tokens.space[12],
  },
  text: { flex: 1, gap: 2 },
  pressed: { opacity: 0.66 },
  working: { opacity: 0.72 },
  disabled: { opacity: 0.42 },
  action: {
    minHeight: tokens.size.tapTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[16],
    paddingHorizontal: ROW_PADDING,
    paddingVertical: tokens.space[8],
    minHeight: tokens.size.tapTarget + 8,
  },
  quiet: { paddingHorizontal: ROW_PADDING, paddingVertical: tokens.space[16] },
  bar: { backgroundColor: 'rgba(255,255,255,0.14)' },
});
