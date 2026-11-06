import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, Pattern, Rect } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';

import { bookCopy } from './bookCopy';
import { BOOK_W, type Volume } from './volumes';

/** Contour rings for "Stillness", generated once. */
const CONTOURS = [1, 2, 3, 4, 5, 6, 7].map((ring) => {
  let d = '';
  for (let point = 0; point <= 48; point += 1) {
    const t = (point / 48) * Math.PI * 2;
    const r =
      6 + ring * 7 + Math.sin(t * 3 + ring * 0.7) * ring * 1.1 + Math.cos(t * 5) * ring * 0.4;
    d += `${point === 0 ? 'M' : 'L'}${(75 + Math.cos(t) * r * 0.92).toFixed(1)} ${(98 + Math.sin(t) * r * 1.12).toFixed(1)} `;
  }
  return `${d}Z`;
});

export function CoverArt({ volume }: { volume: Volume }) {
  const { cloth, foil } = volume;
  const line = { fill: 'none', stroke: foil, strokeLinecap: 'round' as const };

  switch (volume.art) {
    case 'horizon':
      return (
        <>
          <Path d="M100 44 A28 28 0 0 1 128 72 L100 72 Z" fill={foil} opacity={0.35} />
          <Path d="M28 158 A22 22 0 0 1 50 136 L50 158 Z" fill={foil} opacity={0.3} />
          <Circle cx="75" cy="98" r="40" {...line} strokeWidth={0.8} />
          <Circle cx="75" cy="98" r="8" {...line} strokeWidth={1.4} />
          <Path d="M75 42 L50 162 M75 42 L100 162" {...line} strokeWidth={2.4} />
          <Circle cx="75" cy="37" r="5" {...line} strokeWidth={2} />
          <Path d="M75 86 L78 95 L87 98 L78 101 L75 110 L72 101 L63 98 L72 95 Z" fill={foil} />
        </>
      );
    case 'portal':
      return (
        <>
          <Path
            d="M75 18 V50 M75 168 V196 M18 108 H34 M116 108 H132"
            stroke={foil}
            strokeDasharray="2 3"
            strokeWidth={0.9}
          />
          <Rect fill="#EFE7DA" height="104" rx="3" width="72" x="39" y="56" />
          {[1, 2, 3, 4].map((step) => (
            <Rect
              fill="none"
              height={104 - step * 14}
              key={step}
              rx="2"
              stroke="#C9BCA6"
              strokeWidth={0.8}
              width={72 - step * 10}
              x={39 + step * 5}
              y={56 + step * 7}
            />
          ))}
          <Rect fill={cloth} height="30" width="22" x="64" y="93" />
          <Rect fill={foil} height="3" width="3" x="58" y="64" />
          <Rect fill={foil} height="3" width="3" x="89" y="64" />
          <Rect fill={foil} height="3" width="3" x="58" y="150" />
          <Rect fill={foil} height="3" width="3" x="89" y="150" />
        </>
      );
    case 'contours':
      return (
        <>
          {CONTOURS.map((d, ring) => (
            <Path d={d} key={d} {...line} opacity={1 - ring * 0.09} strokeWidth={1.1} />
          ))}
          <Path
            d="M75 70 C70 90, 82 104, 74 128 C68 146, 80 152, 75 166"
            {...line}
            strokeWidth={1.2}
          />
          <Circle cx="75" cy="68" fill={foil} r="5" />
        </>
      );
    case 'signal':
      return (
        <>
          {[0, 1, 2, 3, 4, 5].map((stripe) => (
            <Path
              d={`M${22 + stripe * 8} 170 L${78 + stripe * 8} 82`}
              key={stripe}
              {...line}
              opacity={0.25 + stripe * 0.12}
              strokeWidth={1.4}
            />
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((row) =>
            Array.from({ length: row + 1 }, (_, col) => (
              <Rect
                fill={foil}
                height="5"
                key={`${row}-${col}`}
                width="5"
                x={78 + col * 6}
                y={52 + row * 6}
              />
            )),
          )}
        </>
      );
    case 'orbit':
      return (
        <>
          <Ellipse
            cx="75"
            cy="100"
            rx="56"
            ry="14"
            {...line}
            strokeWidth={0.8}
            transform="rotate(-12 75 100)"
          />
          <Path d="M75 22 V188" stroke={foil} strokeDasharray="1 4" strokeWidth={1} />
          {[58, 100, 142].map((y) => (
            <Path
              d={`M46 ${y - 6} L108 ${y - 16} L104 ${y + 6} L42 ${y + 16} Z`}
              fill={foil}
              key={y}
              opacity={0.92}
            />
          ))}
          {[58, 100, 142].map((y) => (
            <Ellipse
              cx="75"
              cy={y}
              fill={cloth}
              key={`hole-${y}`}
              rx="14"
              ry="5"
              transform={`rotate(-10 75 ${y})`}
            />
          ))}
          <Circle cx="118" cy="92" fill={foil} r="3" />
          <Circle cx="34" cy="112" fill={foil} r="2" />
        </>
      );
    case 'peaks':
      return (
        <>
          <Path d="M22 132 L56 78 L74 104 L98 62 L128 132 Z" fill={foil} opacity={0.12} />
          <Path d="M22 132 L56 78 L74 104 L98 62 L128 132" {...line} strokeWidth={1.8} />
          <Path d="M32 132 H118" {...line} strokeWidth={1} />
          <Circle cx="106" cy="44" fill={foil} r="9" />
          <Circle cx="40" cy="48" fill={foil} r="1.3" />
          <Circle cx="62" cy="36" fill={foil} r="1" />
          <Circle cx="82" cy="52" fill={foil} r="1.2" />
          <Path d="M75 140 V176" stroke={foil} strokeDasharray="1 4" strokeWidth={1} />
        </>
      );
    case 'rhythm':
      return (
        <>
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <Circle
                cx={30 + col * 10}
                cy={40 + row * 10}
                fill={foil}
                key={`${row}-${col}`}
                r="1.8"
              />
            )),
          )}
          <Path d="M38 112 A37 37 0 0 1 112 112 Z" fill={foil} />
          <Path d="M75 112 L75 75 A37 37 0 0 1 112 112 Z" fill="#7A2A1E" />
          <Circle cx="75" cy="112" fill="none" r="15" stroke={cloth} strokeWidth={4} />
          <Circle cx="75" cy="112" fill={cloth} r="6" />
          <Path d="M50 142 A25 25 0 0 0 100 142" {...line} strokeWidth={4} />
          <Rect fill="#3A1A14" height="11" width="11" x="104" y="146" />
          <Path d="M28 168 H122 M28 176 H122" {...line} opacity={0.4} strokeWidth={0.6} />
        </>
      );
    case 'tides':
      return (
        <>
          {[0, 1, 2, 3, 4].map((row) => {
            const y = 70 + row * 16;
            return (
              <Path
                d={`M22 ${y} Q 36 ${y - 9} 50 ${y} T 78 ${y} T 106 ${y} T 128 ${y}`}
                key={row}
                {...line}
                opacity={1 - row * 0.14}
                strokeWidth={1.3}
              />
            );
          })}
          <Circle cx="104" cy="46" fill={foil} r="6" />
        </>
      );
  }
}

/** A cloth cover with its foil art and title. `width` scales the whole of it from the 150 pt shelf size. */
export function BookCover({
  height,
  index,
  volume,
  width,
}: {
  height: number;
  index: number;
  volume: Volume;
  width: number;
}) {
  const s = width / BOOK_W;

  return (
    <View style={[styles.cover, { width, height, backgroundColor: volume.cloth }]}>
      <Svg height="100%" style={StyleSheet.absoluteFill} width="100%">
        <Defs>
          <Pattern height="3" id="clothWeave" patternUnits="userSpaceOnUse" width="3">
            <Path d="M0 3 L3 0" opacity={0.16} stroke="#000000" strokeWidth={0.5} />
          </Pattern>
        </Defs>
        <Rect fill="url(#clothWeave)" height="100%" width="100%" />
      </Svg>
      <Svg
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={StyleSheet.absoluteFill}
        viewBox="0 0 150 210"
        width="100%"
      >
        <CoverArt volume={volume} />
      </Svg>
      <LinearGradient
        colors={['rgba(0,0,0,0.38)', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.14)']}
        end={{ x: 1, y: 0 }}
        locations={[0, 0.04, 0.1, 1]}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <EchoText
        variant="caption"
        numberOfLines={1}
        maxFontSizeMultiplier={1}
        style={[
          styles.label,
          {
            color: volume.foil,
            fontSize: 6 * s,
            lineHeight: 8 * s,
            letterSpacing: 1.3 * s,
            top: 13 * s,
            left: 16 * s,
          },
        ]}
      >
        {bookCopy.coverKicker(index + 1)}
      </EchoText>
      <EchoText
        variant="displayM"
        numberOfLines={1}
        maxFontSizeMultiplier={1}
        style={[
          styles.title,
          {
            color: volume.foil,
            fontSize: 20 * s,
            lineHeight: 24 * s,
            bottom: 26 * s,
            left: 16 * s,
          },
        ]}
      >
        {volume.title}
      </EchoText>
      <EchoText
        variant="caption"
        numberOfLines={1}
        maxFontSizeMultiplier={1}
        style={[
          styles.label,
          {
            color: volume.foil,
            fontSize: 5 * s,
            lineHeight: 7 * s,
            letterSpacing: 1.2 * s,
            bottom: 17 * s,
            left: 16 * s,
          },
        ]}
      >
        {volume.subtitle}
      </EchoText>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    overflow: 'hidden',
    boxShadow: '4px 6px 8px rgba(0,0,0,0.4)',
  },
  label: { position: 'absolute', right: 8, opacity: 0.85 },
  title: { position: 'absolute', right: 8 },
});
