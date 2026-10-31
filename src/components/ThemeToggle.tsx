import { useRef, type PropsWithChildren } from 'react';
import { Pressable, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { useEchoTheme } from '@/design/ThemeProvider';

const DOUBLE_TAP_DELAY_MS = 350;

/** Double-tapping any ECHO wordmark switches the saved app appearance. */
export function ThemeToggle({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { name, setSetting } = useEchoTheme();
  const lastPressAt = useRef<number | null>(null);
  const next = name === 'day' ? 'night' : 'day';

  const toggleTheme = () => {
    lastPressAt.current = null;
    setSetting(next);
  };

  const handlePress = (event: GestureResponderEvent) => {
    // Web keyboard and assistive-technology clicks have no pointer click count.
    if ('detail' in event.nativeEvent && event.nativeEvent.detail === 0) {
      toggleTheme();
      return;
    }

    const now = Date.now();
    if (lastPressAt.current !== null && now - lastPressAt.current <= DOUBLE_TAP_DELAY_MS) {
      toggleTheme();
    } else {
      lastPressAt.current = now;
    }
  };

  return (
    <Pressable
      accessibilityLabel="ECHO"
      accessibilityHint={`Double-tap to switch to ${next === 'day' ? 'Day' : 'Night'} theme`}
      accessibilityRole="button"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'activate') toggleTheme();
      }}
      hitSlop={12}
      onPress={handlePress}
      style={style}
    >
      {children}
    </Pressable>
  );
}
