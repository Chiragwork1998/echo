import { StyleSheet, TextInput } from 'react-native';

import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

export const WRITING_SURFACE = { minHeight: 280, radius: 20, padding: 18 } as const;

type WritingSurfaceProps = {
  autoFocus?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
};

/** Minimum 280 pt writing surface, radius 20 (`specs/COMPONENTS.md`). */
export function WritingSurface({ autoFocus = false, onChangeText, placeholder, value }: WritingSurfaceProps) {
  const { theme } = useEchoTheme();

  return (
    <TextInput
      accessibilityLabel={placeholder}
      autoFocus={autoFocus}
      multiline
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="rgba(255,249,239,0.55)"
      selectionColor={theme.color.accentWarm}
      style={[
        styles.input,
        {
          backgroundColor: theme.color.surfaceGlass,
          borderColor: theme.color.borderGlass,
          color: theme.color.textPrimary,
        },
      ]}
      textAlignVertical="top"
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: WRITING_SURFACE.minHeight,
    borderRadius: WRITING_SURFACE.radius,
    borderWidth: StyleSheet.hairlineWidth,
    padding: WRITING_SURFACE.padding,
    ...tokens.type.display,
    fontSize: tokens.typography.bodyL.size + 2,
    letterSpacing: tokens.typography.bodyL.tracking,
    lineHeight: tokens.typography.bodyL.lineHeight + 6,
  },
});
