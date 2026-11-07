import { useTheme } from '@/design/theme';
import { useTone } from '@/features/onboarding/rhythm/tone';
import { SupportContent } from '@/features/patterns/SupportPanel';
import { Sheet } from '@/features/tab-pages/Sheet';

/**
 * "If you are struggling", from You, at any time: the same people and lines the support panel
 * gives, on a sheet over the page. It opens and closes with a tap, and assumes nothing about why.
 */
export function SupportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { name } = useTheme();
  const tone = useTone();
  return (
    <Sheet visible={visible} onClose={onClose} testID="support-sheet">
      <SupportContent
        context="open"
        onClose={onClose}
        ink={{
          ink: tone.ink,
          soft: tone.inkSoft,
          // Gold reads on midnight; on Day's cream the call stays in ink.
          accent: name === 'day' ? tone.ink : tone.gold,
        }}
      />
    </Sheet>
  );
}
