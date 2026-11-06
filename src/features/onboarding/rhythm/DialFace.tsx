import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';

import type { Tone } from './tone';

// Everything below is measured from the Day golden on a 262 pt dial, then scaled to the dial's size.
export const REFERENCE_SIZE = 262;
const TICK_STEP = 10; // degrees between ticks: 36 round the face
const DOT_STEP = 30; // a dot every third tick
// Radii from the dial centre. The 12 o'clock ticks run long, the 6 o'clock ones are short.
const THIN = { from: 104.5, to: 109.5 };
const DOT = { at: 108.5, radius: 1.6, tail: 103.5 };
const LONG = { from: 104, mid: 112, to: 124 };
const SHORT = { from: 111, to: 118 };
const LABEL_RADIUS = { vertical: 88, horizontal: 96 };
const LABEL_BOX = { width: 24, height: 16 };

export const HANDLE = 22;
const HANDLE_INSET = 1.5; // handle centre, inside the glass edge
const ARC = { span: 54, steps: 18, inset: 1, widest: 3, thinnest: 0.8 };

const point = (centre: number, radius: number, degrees: number) => {
  const a = (degrees * Math.PI) / 180;
  return { x: centre + radius * Math.sin(a), y: centre - radius * Math.cos(a) };
};

function Tick({
  size,
  degrees,
  from,
  to,
  width,
  color,
  opacity = 1,
}: {
  size: number;
  degrees: number;
  from: number;
  to: number;
  width: number;
  color: string;
  opacity?: number;
}) {
  const k = size / REFERENCE_SIZE;
  const a = point(size / 2, from * k, degrees);
  const b = point(size / 2, to * k, degrees);
  return (
    <Line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      opacity={opacity}
    />
  );
}

/** The static face: 36 hour-and-a-bit ticks, and the 12 and 6 labels. Decorative. */
export function DialFace({ size, tone }: { size: number; tone: Tone }) {
  const k = size / REFERENCE_SIZE;
  const centre = size / 2;
  const ticks = Array.from({ length: 360 / TICK_STEP }, (_, i) => i * TICK_STEP);
  const labels = [
    { text: '12', degrees: 0, radius: LABEL_RADIUS.vertical },
    { text: '6', degrees: 90, radius: LABEL_RADIUS.horizontal },
    { text: '12', degrees: 180, radius: LABEL_RADIUS.vertical },
    { text: '6', degrees: 270, radius: LABEL_RADIUS.horizontal },
  ];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={size} height={size}>
        {ticks.map((degrees) => {
          const common = { size, degrees, color: tone.ink };
          if (degrees % 180 === 0) {
            return (
              <G key={degrees}>
                <Tick {...common} from={LONG.from} to={LONG.mid} width={1.3} />
                <Tick {...common} from={LONG.mid} to={LONG.to} width={0.9} opacity={0.6} />
              </G>
            );
          }
          if (degrees % 90 === 0) {
            return <Tick key={degrees} {...common} from={SHORT.from} to={SHORT.to} width={1.1} />;
          }
          if (degrees % DOT_STEP === 0) {
            const dot = point(centre, DOT.at * k, degrees);
            return (
              <G key={degrees}>
                <Tick {...common} from={DOT.tail} to={DOT.at} width={1} opacity={0.75} />
                <Circle cx={dot.x} cy={dot.y} r={DOT.radius * k} fill={tone.ink} />
              </G>
            );
          }
          return (
            <Tick
              key={degrees}
              {...common}
              from={THIN.from}
              to={THIN.to}
              width={0.9}
              opacity={0.62}
            />
          );
        })}
      </Svg>
      {labels.map(({ text, degrees, radius }) => {
        const at = point(centre, radius * k, degrees);
        return (
          <EchoText
            key={degrees}
            variant="caption"
            allowFontScaling={false}
            style={[
              styles.label,
              {
                left: at.x - LABEL_BOX.width / 2,
                top: at.y - LABEL_BOX.height / 2,
                color: tone.ink,
              },
            ]}
          >
            {text}
          </EchoText>
        );
      })}
    </View>
  );
}

/**
 * The warm arc beside the handle, and the handle itself, drawn with the handle at 12 o'clock. The
 * dial turns this layer to the chosen time, so a drag costs one transform and nothing else.
 */
export function HandleLayer({ size, tone }: { size: number; tone: Tone }) {
  const id = `knob${useId().replaceAll(':', '')}`;
  const centre = size / 2;
  const arcRadius = centre - ARC.inset;
  const handleRadius = centre - HANDLE_INSET;
  const segments = Array.from({ length: ARC.steps }, (_, i) => {
    const from = -ARC.span + (2 * ARC.span * i) / ARC.steps;
    const to = -ARC.span + (2 * ARC.span * (i + 1)) / ARC.steps;
    // Strongest beside the handle, fading to a hairline at both ends.
    const weight = Math.cos(((from + to) / 2 / ARC.span) * (Math.PI / 2)) ** 1.3;
    const a = point(centre, arcRadius, from);
    const b = point(centre, arcRadius, to);
    return {
      key: i,
      d: `M ${a.x} ${a.y} A ${arcRadius} ${arcRadius} 0 0 1 ${b.x} ${b.y}`,
      width: ARC.thinnest + (ARC.widest - ARC.thinnest) * weight,
      opacity: 0.3 + 0.7 * weight,
    };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={size} height={size}>
        {segments.map(({ key, d, width, opacity }) => (
          <Path
            key={key}
            d={d}
            stroke={tone.gold}
            strokeWidth={width}
            opacity={opacity}
            fill="none"
          />
        ))}
      </Svg>
      <View
        style={[
          styles.handle,
          { left: centre - HANDLE / 2, top: centre - handleRadius - HANDLE / 2 },
        ]}
      >
        <Svg width={HANDLE} height={HANDLE}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#CDC2B0" />
              <Stop offset="0.62" stopColor="#EFE9DF" />
              <Stop offset="1" stopColor="#FFFFFF" />
            </RadialGradient>
          </Defs>
          <Circle cx={HANDLE / 2} cy={HANDLE / 2} r={HANDLE / 2} fill={`url(#${id})`} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    width: LABEL_BOX.width,
    height: LABEL_BOX.height,
    fontSize: 10.5,
    lineHeight: LABEL_BOX.height,
    letterSpacing: 0,
    textAlign: 'center',
  },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    boxShadow: '0 2px 9px rgba(0,0,0,0.3)',
  },
});
