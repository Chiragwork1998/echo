import { StyleSheet, View } from 'react-native';

import { COLUMN, INTENT_MARKER } from '@/design/onboardingLayout';

type ChoiceMarkerProps = {
  selected: boolean;
  /**
   * `trail` is the Intent marker (ring that becomes a warm ring + white core);
   * `column` is the Horizon/Voice marker (small ring that becomes a filled dot).
   */
  variant?: 'trail' | 'column';
  size?: number;
  strokeWidth?: number;
};

export function ChoiceMarker({
  selected,
  variant = 'trail',
  size,
  strokeWidth,
}: ChoiceMarkerProps) {
  if (variant === 'column') {
    const outer = size ?? COLUMN.markerSize;
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.slot, { width: outer, height: outer }]}
      >
        <View
          style={{
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            borderWidth: strokeWidth ?? COLUMN.markerStroke,
            borderColor: '#FFF9EF',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#03111F',
            shadowOpacity: 0.32,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
          }}
        >
          {selected ? (
            <View
              style={{
                width: COLUMN.selectedCore,
                height: COLUMN.selectedCore,
                borderRadius: COLUMN.selectedCore / 2,
                backgroundColor: '#FFFDF7',
                shadowColor: '#FFF6E4',
                shadowOpacity: 0.65,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 0 },
                elevation: 5,
              }}
            />
          ) : null}
        </View>
      </View>
    );
  }

  const ring = size ?? INTENT_MARKER.ringSize;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.slot}
    >
      <View
        style={
          selected
            ? [
                styles.selected,
                {
                  width: INTENT_MARKER.selectedRing,
                  height: INTENT_MARKER.selectedRing,
                  borderRadius: INTENT_MARKER.selectedRing / 2,
                  borderWidth: INTENT_MARKER.selectedStroke,
                },
              ]
            : [
                styles.idle,
                { width: ring, height: ring, borderRadius: ring / 2, borderWidth: strokeWidth ?? INTENT_MARKER.ringStroke },
              ]
        }
      >
        {selected ? (
          <View
            style={{
              width: INTENT_MARKER.core,
              height: INTENT_MARKER.core,
              borderRadius: INTENT_MARKER.core / 2,
              backgroundColor: '#FFFDF7',
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idle: {
    borderColor: '#FFF9EF',
    shadowColor: '#03111F',
    shadowOpacity: 0.32,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  selected: {
    borderColor: '#EDC77F',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E7B65B',
    shadowOpacity: 0.75,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});
