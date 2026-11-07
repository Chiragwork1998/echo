import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { tokens } from '@/design/tokens';
import { useTone } from '@/features/onboarding/rhythm/tone';
import { Sheet, SheetAction, SheetButton, SheetText, SheetTitle } from '@/features/tab-pages/Sheet';
import { APP_VERSION } from '@/features/you/support';
import {
  cardReport,
  REPORT_REASONS,
  reportCard,
  type ReportReason,
  type ReportResult,
} from '@/services/reportCard';

import { patternsCopy } from './patternsCopy';

const { report: words } = patternsCopy;
const RING = 22;
const DOT = 10;

/** What a report of this card may name: its lens and the model behind it. Never its words. */
export type ReportTarget = { lens: string | null; model: string | null };

/** One reason, as a radio row on the sheet's cloth. */
function Reason({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const tone = useTone();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.reason, pressed && styles.pressed]}
    >
      <EchoText
        variant="bodyM"
        maxFontSizeMultiplier={1.6}
        style={[styles.reasonText, { color: tone.ink }]}
      >
        {label}
      </EchoText>
      <View
        style={[styles.ring, { borderColor: selected ? tone.ink : tone.inkSoft }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {selected ? <View style={[styles.dot, { backgroundColor: tone.ink }]} /> : null}
      </View>
    </Pressable>
  );
}

type Phase = 'choose' | 'sending' | ReportResult;

type Props = {
  /** The card being reported, or null when the sheet is closed. */
  target: ReportTarget | null;
  onClose: () => void;
  /** Called once a report has gone, or is waiting to go. */
  onReported: () => void;
};

const ENDINGS: Record<ReportResult, { title: string; body: string }> = {
  sent: { title: words.sentTitle, body: words.sentBody },
  kept: { title: words.keptTitle, body: words.keptBody },
  failed: { title: words.failedTitle, body: words.failedBody },
};

/**
 * Four reasons and one button. What leaves the phone is said before it is sent, and only the reason,
 * the lens, the model and the app's version leave it. Afterwards it says plainly what happened.
 */
export function ReportSheet({ target, onClose, onReported }: Props) {
  const tone = useTone();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [shownFor, setShownFor] = useState<ReportTarget | null>(null);
  // A new card starts the sheet afresh.
  if (target !== shownFor) {
    setShownFor(target);
    setReason(null);
    setPhase('choose');
  }

  const send = async () => {
    if (!reason || !target || phase === 'sending') return;
    setPhase('sending');
    const result = await reportCard(
      cardReport({ reason, lens: target.lens, model: target.model, appVersion: APP_VERSION }),
    );
    setPhase(result);
    if (result !== 'failed') onReported();
  };

  const ending = phase === 'choose' || phase === 'sending' ? null : ENDINGS[phase];

  const footer = ending ? (
    phase === 'failed' ? (
      <>
        <SheetButton label={words.tryAgain} onPress={() => void send()} />
        <SheetAction label={words.done} onPress={onClose} />
      </>
    ) : (
      <SheetButton label={words.done} onPress={onClose} />
    )
  ) : (
    <>
      <SheetButton
        label={words.send}
        onPress={() => void send()}
        disabled={!reason}
        busy={phase === 'sending'}
        hint={words.chooseFirst}
      />
      <SheetAction label={words.cancel} onPress={onClose} />
    </>
  );

  return (
    <Sheet visible={target !== null} onClose={onClose} footer={footer} testID="report-sheet">
      {ending ? (
        <View style={styles.ending} accessibilityLiveRegion="polite">
          <SheetTitle>{ending.title}</SheetTitle>
          <SheetText soft>{ending.body}</SheetText>
        </View>
      ) : (
        <>
          <SheetTitle>{words.title}</SheetTitle>
          <SheetText>{words.lead}</SheetText>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={words.reasonsLabel}
            style={styles.reasons}
          >
            {REPORT_REASONS.map((value, index) => (
              <Fragment key={value}>
                {index > 0 && <View style={[styles.rule, { backgroundColor: tone.edge }]} />}
                <Reason
                  label={words.reasons[value]}
                  selected={reason === value}
                  onPress={() => setReason(value)}
                />
              </Fragment>
            ))}
          </View>
          <SheetText soft>{words.privacy}</SheetText>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  reasons: { marginVertical: tokens.space[4] },
  reason: {
    minHeight: tokens.size.tapTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
  },
  reasonText: { flex: 1 },
  pressed: { opacity: 0.6 },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  rule: { height: StyleSheet.hairlineWidth },
  ending: { gap: tokens.space[8], paddingBottom: tokens.space[8] },
});
