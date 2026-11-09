import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { tokens } from '@/design/tokens';
import type { EntrySummary } from '@/features/journal';
import { keepTogether } from '@/features/tab-pages/keepTogether';
import {
  Heading,
  Loading,
  Notice,
  OnPlate,
  Row,
  Section,
  SkeletonLine,
  Surface,
  usePlateText,
} from '@/features/tab-pages/parts';
import { PanelSwap, type Face } from '@/features/tab-pages/PanelSwap';
import { Behind, useHandOver } from '@/features/tab-pages/Resolve';
import { Reveal } from '@/features/tab-pages/Reveal';
import { ScrollIntoView } from '@/features/tab-pages/ScrollIntoView';
import { detail, prose, supporting } from '@/features/tab-pages/textStyles';
import { useRequirePlus } from '@/services/plus';
import { sendWaitingReports } from '@/services/reportCard';

import { ConsentChoices, ConsentWords } from './ConsentPanel';
import { entriesToSend } from './gatherEntries';
import { PatternCardView } from './PatternCardView';
import { patternsCopy } from './patternsCopy';
import { QuietAction } from './QuietAction';
import { ReportSheet, type ReportTarget } from './ReportSheet';
import { SupportPanel } from './SupportPanel';
import { usePatternCards, type CardsNotice } from './usePatternCards';

const { cards: words } = patternsCopy;

/** The skeleton stays under the cards until they have come in: their rise (560 ms) and a little over. */
const HAND_OVER_MS = 700;

/** "6 November 2026", in the device's language. */
const readDate = (readAt: number) =>
  new Date(readAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

function noticeText(notice: CardsNotice, hasCards: boolean): string | null {
  const kept = hasCards ? ` ${words.keptEarlier}` : '';
  switch (notice.kind) {
    case 'none':
      return `${words.none}${kept}`;
    case 'not_kept':
      return words.notKept;
    case 'withdrawn':
      return patternsCopy.choices.withdrawn;
    case 'error':
      switch (notice.code) {
        case 'busy':
          return `${words.busy}${kept}`;
        case 'offline':
          return `${words.offline}${kept}`;
        case 'not_configured':
          return `${words.notConfigured}${kept}`;
        case 'allowance_used':
          return `${words.allowanceUsed}${kept}`;
        case 'reading_cap':
          return `${words.readingCap}${kept}`;
        case 'no_entries':
          return `${words.noEntries}${kept}`;
        default:
          return `${words.failed}${kept}`;
      }
    default:
      return null;
  }
}

/** While the entries are read: the shape of a card, and a line saying what is happening. */
function ReadingWords() {
  return (
    <Loading label={words.reading} immediate>
      <View style={styles.reading}>
        <SkeletonLine width="62%" height={20} />
        <View style={styles.readingLines}>
          {(['94%', '88%', '52%'] as const).map((width) => (
            <SkeletonLine key={width} width={width} height={11} />
          ))}
        </View>
        <EchoText variant="bodyM" color="textSecondary" style={detail}>
          {keepTogether(words.reading)}
        </EchoText>
      </View>
    </Loading>
  );
}

/** The same, on its own glass: what stays under the cards while they arrive. */
function Reading() {
  return (
    <Surface strength="strong" radius={tokens.radius.card}>
      <ReadingWords />
    </Surface>
  );
}

/** What a reading is, before the first one. */
function IntroWords() {
  return (
    <View style={styles.intro}>
      <EchoText variant="bodyM" style={prose} maxFontSizeMultiplier={1.6}>
        {keepTogether(words.intro)}
      </EchoText>
    </View>
  );
}

/** A short centred line set on the plate, under the cards or under an action. */
function PlateLine({ children }: { children: string }) {
  const shadow = usePlateText();
  return (
    <OnPlate hug="center">
      <EchoText
        variant="caption"
        align="center"
        style={[supporting, shadow]}
        maxFontSizeMultiplier={1.6}
      >
        {children}
      </EchoText>
    </OnPlate>
  );
}

/** "New readings are part of ECHO Plus.", once the free reading has been made. */
function PlusNote() {
  return <PlateLine>{words.plusNote}</PlateLine>;
}

/**
 * Pattern cards: what keeps returning in the person's own entries. Opening Patterns shows the cards
 * kept on this phone and never calls the server for a reading. A reading is one action, asked for,
 * and it waits on an agreement that cannot be skipped. Every card can be reported. The plain facts
 * sit beneath all of this.
 */
export function PatternCardsSection({ entries }: { entries: readonly EntrySummary[] }) {
  const cards = usePatternCards(entries);
  const requirePlus = useRequirePlus();
  const [reporting, setReporting] = useState<{ key: string; target: ReportTarget } | null>(null);
  const [reported, setReported] = useState<ReadonlySet<string>>(() => new Set());
  const { saved, notice } = cards;
  const hasCards = Boolean(saved);

  // A report kept while ECHO could not be reached goes now, quietly. It names no words.
  useEffect(() => {
    void sendWaitingReports();
  }, []);

  // The reading skeleton does not go the moment the cards come: it stands under them while they
  // arrive, so the sky is never bare between the two.
  const handing = useHandOver(cards.reading, saved?.readAt, HAND_OVER_MS);

  // Whether the section has been laid out: what appears in it after that arrives, and what was
  // there when it was first drawn came with the page.
  const [drawn, setDrawn] = useState(false);

  if (!cards.loaded) return null;

  const text = notice ? noticeText(notice, hasCards) : null;
  const code = notice?.kind === 'error' ? notice.code : null;
  // Trying again helps with most failures. A used free reading is answered by Plus, and a used month
  // and a build without a server by nothing the person can do here.
  const retry =
    code !== null && !['not_configured', 'allowance_used', 'reading_cap'].includes(code);
  // The paywall is the Plus check's to show. With Plus, the reading is asked for again at once.
  const getPlus = () => {
    if (requirePlus('patterns')) cards.read();
  };
  const idle = !cards.asking && !cards.reading;

  // The panel above the cards: before the first reading, what a reading is; then the agreement it
  // waits on; then the reading itself. Each gives way to the next on the same glass (see PanelSwap):
  // cut and drawn again, a panel left the sky bare for a frame, then its glass empty, then its words
  // (the walk, v9 and v10); drawn whole in the very frame, it was a swap with no fade at all (v11).
  let face: Face | null = null;
  if (cards.asking) {
    face = {
      key: 'consent',
      strong: true,
      glass: <ConsentWords count={entriesToSend(entries)} />,
      below: <ConsentChoices onAgree={cards.agree} onDecline={cards.decline} />,
    };
  } else if (cards.reading) {
    face = { key: 'reading', strong: true, glass: <ReadingWords /> };
  } else if (!saved) {
    face = {
      key: 'intro',
      glass: <IntroWords />,
      below: (
        <View style={styles.again}>
          <PrimaryCTA label={words.read} onPress={cards.read} />
          {cards.needsPlus && <PlusNote />}
        </View>
      ),
    };
  }

  return (
    <View
      testID="pattern-cards"
      style={styles.section}
      onLayout={drawn ? undefined : () => setDrawn(true)}
    >
      <Heading>{words.title}</Heading>

      {/* An answer to the reading is put where it can be read: the page keeps its place when the
          skeleton above goes, and a short notice could be left half above the top of the screen. */}
      {notice?.kind === 'support' && (
        <ScrollIntoView key="support">
          <SupportPanel context="patterns" onClose={cards.dismissNotice} />
        </ScrollIntoView>
      )}
      {text && (
        <ScrollIntoView key={text}>
          {code === 'allowance_used' ? (
            <Notice message={text} actionLabel={words.getPlus} onAction={getPlus} />
          ) : (
            <Notice message={text} onAction={retry ? cards.read : undefined} />
          )}
        </ScrollIntoView>
      )}

      {/* A reading asked for over the cards kept from the last one has no panel to take the place
          of, and arrives as a panel does. Anything else the panel shows first is the page's own. */}
      {face && (
        <Reveal duration={tokens.motion.standard} skip={face.key !== 'reading'}>
          <PanelSwap face={face} testID="cards-panel" />
        </Reveal>
      )}

      {saved && (
        <View style={styles.cards}>
          {handing ? (
            <Behind>
              <Reading />
            </Behind>
          ) : null}
          {saved.cards.map((card, index) => {
            const key = `${saved.readAt}-${index}`;
            return (
              <PatternCardView
                key={`${saved.readAt}-${card.name}`}
                card={card}
                index={index + 1}
                total={saved.cards.length}
                fresh={cards.freshAt === saved.readAt}
                reported={reported.has(key)}
                onReport={() =>
                  setReporting({
                    key,
                    target: { lens: card.lens.id ?? null, model: saved.model ?? null },
                  })
                }
              />
            );
          })}
          <PlateLine>
            {`${words.readOn(readDate(saved.readAt))} · ${words.fromEntries(saved.entriesRead)}`}
          </PlateLine>
        </View>
      )}

      {idle && saved && (
        <View style={styles.again}>
          <QuietAction label={words.readAgain} onPress={cards.read} />
          {cards.needsPlus && <PlusNote />}
        </View>
      )}

      {/* Agreeing brings these with the reading: they arrive, rather than appear in one frame. */}
      {(cards.agreed || saved) && !cards.asking && (
        <Reveal duration={tokens.motion.standard} skip={!drawn}>
          <Section title={patternsCopy.choices.title}>
            {cards.agreed && (
              <Row
                label={patternsCopy.choices.withdraw}
                detail={patternsCopy.choices.withdrawDetail}
                onPress={cards.withdraw}
              />
            )}
            {saved && (
              <Row
                label={patternsCopy.choices.deleteCards}
                detail={patternsCopy.choices.deleteDetail}
                onPress={cards.deleteCards}
              />
            )}
          </Section>
        </Reveal>
      )}

      <ReportSheet
        target={reporting?.target ?? null}
        onClose={() => setReporting(null)}
        onReported={() => {
          const key = reporting?.key;
          if (key) setReported((before) => new Set(before).add(key));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: tokens.space[16] },
  cards: { gap: tokens.space[16] },
  again: { alignItems: 'center', gap: tokens.space[12] },
  intro: { paddingHorizontal: tokens.space[24], paddingVertical: tokens.space[20] },
  reading: {
    gap: tokens.space[20],
    paddingHorizontal: tokens.space[24],
    paddingTop: tokens.space[32],
    paddingBottom: tokens.space[24],
  },
  readingLines: { gap: tokens.space[12] },
});
