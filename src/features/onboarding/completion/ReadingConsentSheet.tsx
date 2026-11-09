import { useTone } from '@/features/onboarding/rhythm/tone';
import { ConsentFacts } from '@/features/patterns/ConsentPanel';
import { patternsCopy } from '@/features/patterns/patternsCopy';
import { Sheet, SheetAction, SheetButton, SheetText, SheetTitle } from '@/features/tab-pages/Sheet';

type Props = {
  visible: boolean;
  /** Agreed: today's echo is asked for at once. */
  onAgree: () => void;
  /** Not now, Back, or a tap outside: nothing is sent, and the saved card stays as it was. */
  onClose: () => void;
};

/**
 * The reading agreement, asked from Completion's saved card (D-017): the same agreement, and the same
 * facts, that Patterns asks before a reading, on a sheet over the card so that the person never loses
 * their place. It is only ever opened by the person, after the entry is kept, and never while they
 * journal. Working copy, with the Patterns consent: the owner and counsel approve it before release.
 */
export function ReadingConsentSheet({ visible, onAgree, onClose }: Props) {
  const tone = useTone();
  const { consent } = patternsCopy;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      testID="reading-consent"
      footer={
        <>
          <SheetButton label={consent.agree} onPress={onAgree} />
          <SheetAction label={consent.notNow} onPress={onClose} />
        </>
      }
    >
      <SheetTitle>{consent.title}</SheetTitle>
      <SheetText soft>{consent.lead}</SheetText>
      <SheetText>{consent.sendsKept}</SheetText>
      <ConsentFacts mark={tone.gold} ink={tone.ink} />
    </Sheet>
  );
}
