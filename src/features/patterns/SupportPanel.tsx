import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { tokens } from '@/design/tokens';

import { deviceRegion } from './deviceRegion';
import { SUPPORT_DIRECTORY, supportCopy, supportLinesFor } from './supportResources';

const open = (link: string) => void Linking.openURL(link).catch(() => undefined);

type Props = { onClose: () => void; region?: string | null };

/**
 * Shown instead of pattern cards when the server finds language about suicide or self-harm. Calm,
 * unhurried, and never a wall: it can be closed. PENDING legal and product review (see
 * supportResources.ts). Its words are working copy until then.
 */
export function SupportPanel({ onClose, region = deviceRegion() }: Props) {
  const lines = supportLinesFor(region);
  return (
    <GlassCard radius={tokens.radius.medium} strength="strong">
      <View style={styles.panel} accessibilityLiveRegion="polite">
        <EchoText variant="bodyL" serif accessibilityRole="header" style={styles.title}>
          {supportCopy.title}
        </EchoText>
        <EchoText variant="bodyM" color="textSecondary" style={styles.body}>
          {supportCopy.body}
        </EchoText>

        {lines.length > 0 && (
          <View style={styles.group}>
            <EchoText variant="caption" color="textSecondary" accessibilityRole="header">
              {supportCopy.linesTitle.toUpperCase()}
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
                    <EchoText variant="bodyM">{line.name}</EchoText>
                    <EchoText variant="bodyL" style={styles.contact}>
                      {line.contact}
                    </EchoText>
                  </View>
                  <EchoText variant="label" accessibilityElementsHidden>
                    {supportCopy.callWord.toUpperCase()}
                  </EchoText>
                </View>
                <EchoText variant="caption" color="textSecondary" style={styles.detail}>
                  {line.detail}
                </EchoText>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.group}>
          <EchoText variant="caption" color="textSecondary" accessibilityRole="header">
            {supportCopy.directoryTitle.toUpperCase()}
          </EchoText>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${SUPPORT_DIRECTORY.name}. ${supportCopy.noLocalLine}`}
            onPress={() => open(SUPPORT_DIRECTORY.link)}
            style={({ pressed }) => [styles.line, pressed && styles.pressed]}
          >
            <EchoText variant="bodyM">{SUPPORT_DIRECTORY.name}</EchoText>
            <EchoText variant="caption" color="textSecondary" style={styles.detail}>
              {`${SUPPORT_DIRECTORY.host}. ${supportCopy.noLocalLine}`}
            </EchoText>
          </Pressable>
        </View>

        <EchoText variant="bodyM">{supportCopy.emergency}</EchoText>
        <EchoText variant="caption" color="textSecondary" style={styles.detail}>
          {supportCopy.footer}
        </EchoText>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={supportCopy.close}
          onPress={onClose}
          style={styles.close}
        >
          <EchoText variant="label">{supportCopy.close.toUpperCase()}</EchoText>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  panel: { padding: tokens.space[20], gap: tokens.space[16] },
  title: { fontSize: 26, lineHeight: 32 },
  body: { lineHeight: 24 },
  group: { gap: tokens.space[8] },
  line: {
    minHeight: tokens.size.tapTarget + 12,
    justifyContent: 'center',
    gap: 2,
    paddingVertical: tokens.space[8],
  },
  pressed: { opacity: 0.7 },
  lineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space[12],
  },
  lineText: { flex: 1 },
  contact: { letterSpacing: 0.4 },
  detail: { fontSize: 12.5, lineHeight: 17, letterSpacing: 0.1 },
  close: {
    minHeight: tokens.size.tapTarget,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[16],
  },
});
