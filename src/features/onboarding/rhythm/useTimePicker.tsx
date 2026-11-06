import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { wrapMinutes } from './time';
import { useTone } from './tone';

const toDate = (minutes: number) => new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
const fromDate = (date: Date) => wrapMinutes(date.getHours() * 60 + date.getMinutes());

type Options = {
  minutes: number;
  is24Hour: boolean;
  onChange: (minutes: number) => void;
};

/**
 * The platform's own time picker. Android opens its dialog. iOS shows the wheel in a sheet that
 * closes when the person taps outside it. Returns `open` and the `sheet` element to render once.
 */
export function useTimePicker({ minutes, is24Hour, onChange }: Options): {
  open: () => void;
  sheet: ReactNode;
} {
  const [visible, setVisible] = useState(false);
  const { name } = useTheme();
  const tone = useTone();

  const open = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(minutes),
        mode: 'time',
        is24Hour,
        onValueChange: (_event, date) => onChange(fromDate(date)),
      });
    } else if (Platform.OS === 'ios') {
      setVisible(true);
    }
  }, [minutes, is24Hour, onChange]);

  const close = useCallback(() => setVisible(false), []);

  const sheet =
    Platform.OS === 'ios' ? (
      <Modal transparent animationType="fade" visible={visible} onRequestClose={close}>
        <Pressable style={styles.scrim} onPress={close} accessible={false}>
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            onStartShouldSetResponder={() => true}
            style={[styles.sheet, { backgroundColor: tone.sheet, borderColor: tone.edge }]}
          >
            <DateTimePicker
              value={toDate(minutes)}
              mode="time"
              display="spinner"
              themeVariant={name === 'night' ? 'dark' : 'light'}
              textColor={tone.ink}
              onValueChange={(_event, date) => onChange(fromDate(date))}
            />
          </View>
        </Pressable>
      </Modal>
    ) : null;

  return { open, sheet };
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,11,22,0.38)' },
  sheet: {
    margin: tokens.space[12],
    marginBottom: tokens.space[32],
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    paddingVertical: tokens.space[8],
  },
});
