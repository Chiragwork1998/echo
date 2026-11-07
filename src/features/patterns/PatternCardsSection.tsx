import { StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import type { EntrySummary } from '@/features/journal';
import { Heading, Notice, OnPlate, Quiet, Row, Section } from '@/features/tab-pages/parts';
import { onPlate } from '@/features/tab-pages/textStyles';
import { tokens } from '@/design/tokens';
import { useRequirePlus } from '@/services/plus';

import { entriesToSend } from './gatherEntries';
import { ConsentPanel } from './ConsentPanel';
import { PatternCardView } from './PatternCardView';
import { patternsCopy } from './patternsCopy';
import { QuietAction } from './QuietAction';
import { SupportPanel } from './SupportPanel';
import { usePatternCards, type CardsNotice } from './usePatternCards';

const { cards: words } = patternsCopy;

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

/**
 * Pattern cards: what keeps returning in the person's own entries. Opening Patterns shows the cards
 * kept on this phone and never calls the server. A reading is one quiet action, asked for, and it
 * waits on an agreement that cannot be skipped. The plain facts sit beneath all of this.
 */
export function PatternCardsSection({ entries }: { entries: readonly EntrySummary[] }) {
  const cards = usePatternCards(entries);
  const requirePlus = useRequirePlus();
  const { saved, notice } = cards;
  const hasCards = Boolean(saved);

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

  return (
    <View style={styles.section}>
      <Heading>{words.title}</Heading>

      {notice?.kind === 'support' && <SupportPanel onClose={cards.dismissNotice} />}
      {text &&
        (code === 'allowance_used' ? (
          <Notice message={text} actionLabel={words.getPlus} onAction={getPlus} />
        ) : (
          <Notice message={text} onAction={retry ? cards.read : undefined} />
        ))}

      {cards.asking && (
        <ConsentPanel
          count={entriesToSend(entries)}
          onAgree={cards.agree}
          onDecline={cards.decline}
        />
      )}

      {cards.reading && <Quiet busy>{words.reading}</Quiet>}

      {saved && (
        <>
          {saved.cards.map((card, index) => (
            <PatternCardView
              key={`${saved.readAt}-${card.name}`}
              card={card}
              index={index + 1}
              total={saved.cards.length}
            />
          ))}
          <OnPlate>
            <EchoText variant="caption" color="textSecondary" align="center" style={onPlate}>
              {`${words.readOn(readDate(saved.readAt))} · ${words.fromEntries(saved.entriesRead)}`}
            </EchoText>
          </OnPlate>
        </>
      )}

      {!cards.asking && !cards.reading && (
        <>
          {!saved && <Quiet>{words.intro}</Quiet>}
          <QuietAction label={saved ? words.readAgain : words.read} onPress={cards.read} />
        </>
      )}

      {(cards.agreed || saved) && !cards.asking && (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: tokens.space[16] },
});
