import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

export type Star = { x: number; y: number; r: number };
export type Figure = { stars: Star[]; lines: [number, number][] };

// The sky is drawn on a 100 x 50 board. Seven stars sit in seven of twelve loose cells.
const BOARD = { width: 100, height: 50 };
const COLUMNS = 4;
const ROWS = 3;
const STARS = 7;

/** Small, fast, and the same every time for the same seed. */
function randomFrom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
};

/**
 * A small figure of stars joined by hairlines, drawn from the card's name alone. It means nothing:
 * it is the card's own sky, so that no two cards look the same.
 */
export function figureFor(name: string): Figure {
  const next = randomFrom(hash(name));
  const cells = Array.from({ length: COLUMNS * ROWS }, (_, index) => index)
    .map((index) => ({ index, order: next() }))
    .sort((a, b) => a.order - b.order)
    .slice(0, STARS)
    .map(({ index }) => index);

  const stars = cells
    .map((cell): Star => {
      const column = cell % COLUMNS;
      const row = Math.floor(cell / COLUMNS);
      return {
        x: ((column + 0.15 + next() * 0.7) / COLUMNS) * BOARD.width,
        y: ((row + 0.15 + next() * 0.7) / ROWS) * BOARD.height,
        r: 0.55 + next() * 0.75,
      };
    })
    .sort((a, b) => a.x - b.x);

  // A path from left to right, and one stray line back, so that it reads as a figure.
  const lines: [number, number][] = stars.slice(1).map((_, index) => [index, index + 1]);
  if (stars.length > 4) lines.push([1, Math.min(stars.length - 1, 4)]);
  return { stars, lines };
}

type Props = { name: string; color: string; opacity?: number };

/** Decorative only, so it is hidden from screen readers. */
export function Constellation({ name, color, opacity = 0.4 }: Props) {
  const { stars, lines } = figureFor(name);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid slice">
        {lines.map(([from, to], index) => {
          const a = stars[from];
          const b = stars[to];
          return a && b ? (
            <Line
              key={index}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={0.18}
              strokeOpacity={opacity * 0.9}
              strokeLinecap="round"
            />
          ) : null;
        })}
        {stars.map((star, index) => (
          <Circle
            key={`halo${index}`}
            cx={star.x}
            cy={star.y}
            r={star.r * 2.6}
            fill={color}
            fillOpacity={opacity * 0.22}
          />
        ))}
        {stars.map((star, index) => (
          <Circle
            key={`core${index}`}
            cx={star.x}
            cy={star.y}
            r={star.r * 0.5}
            fill={color}
            fillOpacity={Math.min(1, opacity * 2)}
          />
        ))}
      </Svg>
    </View>
  );
}
