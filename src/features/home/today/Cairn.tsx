import { useId } from 'react';
import Svg, { Defs, Ellipse, G, RadialGradient, Stop } from 'react-native-svg';

/** Stones from the base up, in a 40 x 40 box. Slightly off-axis, as a hand-built stack would be. */
const STONES = [
  { cx: 20, cy: 31.4, rx: 16.6, ry: 7.2 },
  { cx: 19.6, cy: 21.2, rx: 11.6, ry: 5.2 },
  { cx: 20.4, cy: 13.4, rx: 7.7, ry: 3.6 },
  { cx: 20, cy: 7.4, rx: 4.5, ry: 2.9 },
] as const;

const SAND = [
  { offset: 0, color: '#F3E4CF' },
  { offset: 0.38, color: '#DEC4A5' },
  { offset: 0.76, color: '#B99676' },
  { offset: 1, color: '#7E5F47' },
] as const;

const OUTLINE = 'rgba(226,231,239,0.72)';
const DASH = '5.2 2.6';

function BuiltStack({ id }: { id: string }) {
  return (
    <>
      <Defs>
        {/* The light falls from upper left and is shared by every stone in the stack. */}
        <RadialGradient id={`${id}s`} cx="36%" cy="24%" r="82%">
          {SAND.map(({ offset, color }) => (
            <Stop key={offset} offset={offset} stopColor={color} />
          ))}
        </RadialGradient>
        <RadialGradient id={`${id}g`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#02060D" stopOpacity={0.62} />
          <Stop offset="1" stopColor="#02060D" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}c`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#3D2A1A" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#3D2A1A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={20.8} cy={36.6} rx={18.4} ry={3.2} fill={`url(#${id}g)`} />
      {STONES.map((stone, index) => (
        <G key={stone.cy}>
          <Ellipse {...stone} fill={`url(#${id}s)`} />
          {/* Each stone darkens where the next one rests on it, which is what gives the stack weight. */}
          {index < STONES.length - 1 && (
            <Ellipse
              cx={STONES[index + 1]?.cx}
              cy={stone.cy - stone.ry + 1.1}
              rx={(STONES[index + 1]?.rx ?? 0) * 1.08}
              ry={1.9}
              fill={`url(#${id}c)`}
            />
          )}
        </G>
      ))}
    </>
  );
}

function OpenStack() {
  return STONES.map((stone) => (
    <Ellipse
      key={stone.cy}
      {...stone}
      fill="none"
      stroke={OUTLINE}
      strokeWidth={1.25}
      strokeDasharray={DASH}
      strokeLinecap="round"
    />
  ));
}

/** A day of the week as a small stack of stones: built when completed, a dashed outline otherwise. */
export function Cairn({ built, size }: { built: boolean; size: number }) {
  // Ids must be unique per instance, and url(#...) cannot hold the colons React puts in useId.
  const id = `cairn${useId().replaceAll(':', '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
      {built ? <BuiltStack id={id} /> : <OpenStack />}
    </Svg>
  );
}
