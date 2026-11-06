import { StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { ScreenShell } from '@/components/ScreenShell';

/** Route shell only. Echoes, Patterns and You have no approved design yet (AGENTS.md). */
export function PlaceholderTab({ title }: { title: string }) {
  return (
    <ScreenShell screen="home">
      <View style={styles.title}>
        <EchoText variant="displayM" align="center" accessibilityRole="header">
          {title}
        </EchoText>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({ title: { marginTop: 96 } });
