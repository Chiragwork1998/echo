import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { keepTogether } from '@/features/tab-pages/keepTogether';
import { Surface } from '@/features/tab-pages/parts';
import { detail, prose, question, supporting, textAction } from '@/features/tab-pages/textStyles';

import { deviceRegion } from './deviceRegion';
import { SUPPORT_DIRECTORY, supportCopy, supportLinesFor } from './supportResources';

const open = (link: string) => void Linking.openURL(link).catch(() => undefined);

/**
 * Where the panel is opened, which decides only its first words. After a reading it says the cards
 * were set aside. After a practice it meets what the person said. From You it assumes nothing.
 */
export type SupportContext = 'patterns' | 'practice' | 'open';

const opening: Record<SupportContext, { title: string; body: string }> = {
  patterns: { title: supportCopy.title, body: supportCopy.body },
  practice: { title: supportCopy.title, body: supportCopy.reach },
  open: { title: supportCopy.openTitle, body: supportCopy.reach },
};

/** The colours the panel is set in: the page's own on glass, or a sheet's ink on its cloth. */
export type SupportInk = { ink: string; soft: string; accent: string };

type ContentProps = {
  onClose: () => void;
  region?: string | null;
  context?: SupportContext;
  ink: SupportInk;
};

/**
 * The words and the ways to reach someone. Calm, unhurried, and never a wall: it can be closed.
 * PENDING legal and product review (see supportResources.ts). Its words are working copy until then.
 */
export function SupportContent({
  onClose,
  region = deviceRegion(),
  context = 'practice',
  ink,
}: ContentProps) {
  const lines = supportLinesFor(region);
  const { title, body } = opening[context];
  const soft = { color: ink.soft };
  return (
    <View style={styles.content} accessibilityLiveRegion="polite">
      <EchoText
        variant="bodyL"
        accessibilityRole="header"
        accessibilityLabel={title}
        maxFontSizeMultiplier={1.5}
        style={[question, { color: ink.ink }]}
      >
        {keepTogether(title)}
      </EchoText>
      <EchoText variant="bodyM" maxFontSizeMultiplier={1.6} style={[prose, soft]}>
        {keepTogether(body)}
      </EchoText>

      {lines.length > 0 && (
        <View style={styles.group}>
          <EchoText
            variant="bodyM"
            accessibilityRole="header"
            maxFontSizeMultiplier={1.6}
            style={[detail, styles.groupName, soft]}
          >
            {supportCopy.linesTitle}
          </EchoText>
          {lines.map((line) => (
            <Pressable
              key={line.name}
              accessibilityRole="button"
              accessibilityLabel={`${supportCopy.call(line.name, line.contact)}. ${line.detail}`}
              onPress={() => open(line.link)}
              style={({ pressed }) => [styles.line, pressed && styles.pressed]}
            >
              <View style={styles.lineTop}>
                <View style={styles.lineText}>
                  <EchoText variant="bodyM" maxFontSizeMultiplier={1.6} style={{ color: ink.ink }}>
                    {line.name}
                  </EchoText>
                  <EchoText
                    variant="bodyL"
                    maxFontSizeMultiplier={1.6}
                    style={[styles.contact, { color: ink.ink }]}
                  >
                    {line.contact}
                  </EchoText>
                </View>
                <EchoText
                  variant="bodyM"
                  accessibilityElementsHidden
                  style={[textAction, { color: ink.accent }]}
                >
                  {supportCopy.callWord}
                </EchoText>
              </View>
              <EchoText variant="caption" maxFontSizeMultiplier={1.6} style={[supporting, soft]}>
                {line.detail}
              </EchoText>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.group}>
        <EchoText
          variant="bodyM"
          accessibilityRole="header"
          maxFontSizeMultiplier={1.6}
          style={[detail, styles.groupName, soft]}
        >
          {supportCopy.directoryTitle}
        </EchoText>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${SUPPORT_DIRECTORY.name}. ${supportCopy.noLocalLine}`}
          onPress={() => open(SUPPORT_DIRECTORY.link)}
          style={({ pressed }) => [styles.line, pressed && styles.pressed]}
        >
          <EchoText variant="bodyM" maxFontSizeMultiplier={1.6} style={{ color: ink.ink }}>
            {SUPPORT_DIRECTORY.name}
          </EchoText>
          <EchoText variant="caption" maxFontSizeMultiplier={1.6} style={[supporting, soft]}>
            {`${SUPPORT_DIRECTORY.host}. ${supportCopy.noLocalLine}`}
          </EchoText>
        </Pressable>
      </View>

      <EchoText variant="bodyM" maxFontSizeMultiplier={1.6} style={[prose, { color: ink.ink }]}>
        {keepTogether(supportCopy.emergency)}
      </EchoText>
      <EchoText variant="caption" maxFontSizeMultiplier={1.6} style={[supporting, soft]}>
        {keepTogether(supportCopy.footer)}
      </EchoText>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={supportCopy.close}
        onPress={onClose}
        hitSlop={6}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        <EchoText
          variant="bodyM"
          maxFontSizeMultiplier={1.5}
          style={[textAction, { color: ink.ink }]}
        >
          {supportCopy.close}
        </EchoText>
      </Pressable>
    </View>
  );
}

type Props = { onClose: () => void; region?: string | null; context?: SupportContext };

/**
 * Shown instead of pattern cards when the server finds language about suicide or self-harm, and
 * after a practice when the person is still unsettled. On glass, in the page's own ink.
 */
export function SupportPanel({ onClose, region, context = 'practice' }: Props) {
  const { colors } = useTheme();
  return (
    <Surface strength="strong" radius={tokens.radius.card}>
      <View style={styles.panel}>
        <SupportContent
          onClose={onClose}
          region={region}
          context={context}
          ink={{ ink: colors.textPrimary, soft: colors.textSecondary, accent: colors.accentWarm }}
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: tokens.space[24],
    paddingTop: tokens.space[24],
    paddingBottom: tokens.space[8],
  },
  content: { gap: tokens.space[16] },
  group: { gap: tokens.space[8] },
  groupName: { fontFamily: 'Inter_500Medium' },
  line: {
    minHeight: tokens.size.tapTarget + 12,
    justifyContent: 'center',
    gap: 2,
    paddingVertical: tokens.space[8],
  },
  pressed: { opacity: 0.6 },
  lineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space[12],
  },
  lineText: { flex: 1 },
  contact: { fontFamily: 'Inter_500Medium', letterSpacing: 0.4 },
  close: {
    minHeight: tokens.size.tapTarget,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[16],
  },
});
