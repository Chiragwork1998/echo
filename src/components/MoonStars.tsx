import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, G, RadialGradient, Stop } from 'react-native-svg';

/**
 * `product-handoff/assets/overlays/moon-stars.svg` drawn with typed primitives.
 * Reference canvas is 393 x 852 pt, matching the background plate; `slice` keeps
 * the overlay registered with the cover-scaled plate. The source glow uses a
 * 9 pt gaussian blur, reproduced here by the gradient's own falloff so the
 * overlay renders identically across native and web.
 */
const MOON = { cx: 306, cy: 214, radius: 15 } as const;
const MOON_GLOW_RADIUS = 38;

const STARS = [
  { cx: 54, cy: 84, r: 0.8 },
  { cx: 88, cy: 142, r: 0.6 },
  { cx: 132, cy: 62, r: 0.9 },
  { cx: 185, cy: 115, r: 0.6 },
  { cx: 232, cy: 72, r: 0.7 },
  { cx: 344, cy: 104, r: 0.8 },
  { cx: 364, cy: 168, r: 0.6 },
  { cx: 281, cy: 154, r: 0.6 },
  { cx: 28, cy: 205, r: 0.7 },
] as const;

export function MoonStars() {
  return (
    <Svg
      height="100%"
      pointerEvents="none"
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 393 852"
      width="100%"
    >
      <Defs>
        <RadialGradient cx="0.5" cy="0.5" id="echoMoonGlow" r="0.5">
          <Stop offset="0" stopColor="#FFF7E7" stopOpacity={0.75} />
          <Stop offset="1" stopColor="#FFF7E7" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={MOON.cx} cy={MOON.cy} fill="url(#echoMoonGlow)" r={MOON_GLOW_RADIUS} />
      <Circle cx={MOON.cx} cy={MOON.cy} fill="#FFF8E9" r={MOON.radius} />
      <G fill="#FFFFFF" opacity={0.66}>
        {STARS.map((star) => (
          <Circle cx={star.cx} cy={star.cy} key={`${star.cx}-${star.cy}`} r={star.r} />
        ))}
      </G>
    </Svg>
  );
}
