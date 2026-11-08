import { memo } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
  Text,
} from 'react-native-svg';

/**
 * Gold foil, not paint: a metal that holds a band of light across its middle. One sheet of it runs
 * corner to corner over the whole card, so every line of the ornament catches the same light.
 */
export const FOIL: readonly [number, string][] = [
  [0, '#7A5A2E'],
  [0.2, '#B08A47'],
  [0.36, '#E2C37F'],
  [0.44, '#F0D9A2'],
  [0.52, '#CFA963'],
  [0.7, '#A57D3D'],
  [0.86, '#C59E5A'],
  [1, '#7A5A2E'],
];

/** Foil stops as SVG <Stop>s. */
export function foilStops() {
  return FOIL.map(([offset, color]) => <Stop key={offset} offset={offset} stopColor={color} />);
}

/** The gilded edge every card has, back and face: a fine band of foil just inside its outline. */
export function GildedEdge({
  width,
  height,
  radius,
  id,
}: {
  width: number;
  height: number;
  radius: number;
  id: string;
}) {
  return (
    <Svg width={width} height={height} pointerEvents="none" style={{ position: 'absolute' }}>
      <Defs>
        <LinearGradient id={id} x1={0} y1={0} x2={width} y2={height} gradientUnits="userSpaceOnUse">
          {foilStops()}
        </LinearGradient>
      </Defs>
      <Rect
        x={0.9}
        y={0.9}
        width={width - 1.8}
        height={height - 1.8}
        rx={radius - 0.9}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={1.8}
      />
    </Svg>
  );
}

/** The rosette's 24 rings: each centred on a circle the size of itself, as a guilloche is drawn. */
const PETALS = 24;
/** Where the inner frame sits, inside the edge. */
const FRAME = 11;
const FRAME_INNER = 15;

/** A corner flourish inside the frame: a rounded bracket and a small diamond. Drawn top left. */
function corner(x: number, y: number) {
  return `M${x + 4} ${y + 24} L${x + 4} ${y + 11} Q${x + 4} ${y + 4} ${x + 11} ${y + 4} L${x + 24} ${y + 4}`;
}

/**
 * The back every card shares, as a fine deck's back is made: deep navy with a linen weave, gilded
 * edges, a double frame of foil with a flourish at each corner, and at its heart a guilloche rosette
 * (the echo, many times over) around a foil medallion that holds the cairn. ECHO at either end, one
 * upside down: a card back reads the same whichever way it lies.
 */
export const CardBack = memo(function CardBack({
  width,
  height,
  radius,
}: {
  width: number;
  height: number;
  radius: number;
}) {
  const cx = width / 2;
  const cy = height / 2;
  const petal = Math.round(width * 0.135);
  const rings = [petal * 2 + 12, petal * 2 + 20, petal * 2 + 28];
  const dotted = petal * 2 + 40;
  const markY = FRAME_INNER + 32;
  const stemTop = markY + 16;
  const stemBottom = cy - dotted - 10;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id="cb-navy" cx="50%" cy="48%" rx="70%" ry="62%">
          <Stop offset={0} stopColor="#183259" />
          <Stop offset={0.55} stopColor="#0C1B35" />
          <Stop offset={1} stopColor="#050B17" />
        </RadialGradient>
        <LinearGradient
          id="cb-foil"
          x1={0}
          y1={0}
          x2={width}
          y2={height}
          gradientUnits="userSpaceOnUse"
        >
          {foilStops()}
        </LinearGradient>
        <RadialGradient id="cb-glow" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset={0} stopColor="#F3E0B4" stopOpacity={0.2} />
          <Stop offset={0.5} stopColor="#E4C68E" stopOpacity={0.06} />
          <Stop offset={1} stopColor="#E4C68E" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="cb-cairn" x1={4} y1={4} x2={24} y2={26} gradientUnits="userSpaceOnUse">
          {foilStops()}
        </LinearGradient>
        <Pattern id="cb-linen" width={5} height={5} patternUnits="userSpaceOnUse">
          <Path
            d="M0 5 L5 0 M-1 1 L1 -1 M4 6 L6 4"
            stroke="#FFFFFF"
            strokeWidth={0.45}
            opacity={0.05}
          />
          <Path d="M0 0 L5 5" stroke="#000000" strokeWidth={0.45} opacity={0.12} />
        </Pattern>
      </Defs>

      <Rect x={0} y={0} width={width} height={height} fill="url(#cb-navy)" />
      <Rect x={0} y={0} width={width} height={height} fill="url(#cb-linen)" />
      <Circle cx={cx} cy={cy} r={dotted + 36} fill="url(#cb-glow)" />

      {/* The frame: a stronger rule, then a fine one inside it. */}
      <Rect
        x={FRAME}
        y={FRAME}
        width={width - FRAME * 2}
        height={height - FRAME * 2}
        rx={radius - FRAME / 2}
        fill="none"
        stroke="url(#cb-foil)"
        strokeWidth={1.1}
      />
      <Rect
        x={FRAME_INNER}
        y={FRAME_INNER}
        width={width - FRAME_INNER * 2}
        height={height - FRAME_INNER * 2}
        rx={radius - FRAME_INNER / 2}
        fill="none"
        stroke="url(#cb-foil)"
        strokeWidth={0.55}
        opacity={0.75}
      />

      {/* A flourish in each corner: drawn once, mirrored three times. */}
      {[
        undefined,
        `translate(${width} 0) scale(-1 1)`,
        `translate(0 ${height}) scale(1 -1)`,
        `translate(${width} ${height}) scale(-1 -1)`,
      ].map((transform, i) => (
        <G key={i} transform={transform}>
          <Path
            d={corner(FRAME_INNER, FRAME_INNER)}
            fill="none"
            stroke="url(#cb-foil)"
            strokeWidth={0.8}
            strokeLinecap="round"
          />
          <Rect
            x={FRAME_INNER + 9}
            y={FRAME_INNER + 9}
            width={3.2}
            height={3.2}
            fill="url(#cb-foil)"
            transform={`rotate(45 ${FRAME_INNER + 10.6} ${FRAME_INNER + 10.6})`}
          />
        </G>
      ))}

      {/* The rosette: the echo, many times over. */}
      <G opacity={0.55}>
        {Array.from({ length: PETALS }, (_, i) => {
          const angle = (i / PETALS) * Math.PI * 2;
          return (
            <Circle
              key={i}
              cx={cx + Math.cos(angle) * petal}
              cy={cy + Math.sin(angle) * petal}
              r={petal}
              fill="none"
              stroke="url(#cb-foil)"
              strokeWidth={0.55}
            />
          );
        })}
      </G>
      {rings.map((r, i) => (
        <Circle
          key={r}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="url(#cb-foil)"
          strokeWidth={i === 1 ? 1 : 0.5}
          opacity={i === 1 ? 0.9 : 0.6}
        />
      ))}
      <Circle
        cx={cx}
        cy={cy}
        r={dotted}
        fill="none"
        stroke="url(#cb-foil)"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeDasharray="0.1 5.6"
        opacity={0.85}
      />

      {/* Stems from the rosette to each mark, with a diamond on each. */}
      {[1, -1].map((dir) => {
        const y1 = dir === 1 ? stemTop : height - stemTop;
        const y2 = dir === 1 ? stemBottom : height - stemBottom;
        const mid = (y1 + y2) / 2;
        return (
          <G key={dir}>
            <Line
              x1={cx}
              y1={y1}
              x2={cx}
              y2={y2}
              stroke="url(#cb-foil)"
              strokeWidth={0.6}
              opacity={0.8}
            />
            <Rect
              x={cx - 2.2}
              y={mid - 2.2}
              width={4.4}
              height={4.4}
              fill="url(#cb-foil)"
              transform={`rotate(45 ${cx} ${mid})`}
            />
          </G>
        );
      })}

      {/* The medallion and its cairn. */}
      <Circle cx={cx} cy={cy} r={27} fill="#0B1A33" stroke="url(#cb-foil)" strokeWidth={1.2} />
      <Circle
        cx={cx}
        cy={cy}
        r={22.5}
        fill="none"
        stroke="url(#cb-foil)"
        strokeWidth={0.5}
        opacity={0.7}
      />
      <G transform={`translate(${cx - 16.8} ${cy - 17.4}) scale(1.2)`}>
        <Ellipse cx={14} cy={22} rx={10} ry={3} fill="url(#cb-cairn)" />
        <Ellipse cx={14} cy={16} rx={7} ry={3} fill="url(#cb-cairn)" />
        <Ellipse cx={14} cy={10.5} rx={4.5} ry={2.5} fill="url(#cb-cairn)" />
        <Ellipse cx={14} cy={6} rx={2.5} ry={2} fill="url(#cb-cairn)" />
      </G>

      {/* ECHO at both ends, the top one upside down. */}
      {[false, true].map((flip) => (
        <Text
          key={String(flip)}
          x={cx}
          y={height - markY}
          fill="url(#cb-foil)"
          fontFamily="CormorantGaramond_500Medium"
          fontSize={12}
          letterSpacing={5}
          textAnchor="middle"
          transform={flip ? `rotate(180 ${cx} ${height / 2})` : undefined}
        >
          ECHO
        </Text>
      ))}
    </Svg>
  );
});

/**
 * The ground of the face: the same navy, linen and foil as the back, so the card is one object.
 * A double foil frame inside the gilded edge, a fine double rule around the scene's window like a
 * mount, and a low warm light where the name sits.
 */
export const FaceGround = memo(function FaceGround({
  width,
  height,
  radius,
  window,
}: {
  width: number;
  height: number;
  radius: number;
  window: { x: number; y: number; size: number };
}) {
  const cx = width / 2;
  const below = window.y + window.size;
  return (
    <Svg width={width} height={height} style={{ position: 'absolute' }} pointerEvents="none">
      <Defs>
        <RadialGradient id="cf-navy" cx="50%" cy="42%" rx="72%" ry="64%">
          <Stop offset={0} stopColor="#16305A" />
          <Stop offset={0.55} stopColor="#0C1B35" />
          <Stop offset={1} stopColor="#050B17" />
        </RadialGradient>
        <LinearGradient
          id="cf-foil"
          x1={0}
          y1={0}
          x2={width}
          y2={height}
          gradientUnits="userSpaceOnUse"
        >
          {foilStops()}
        </LinearGradient>
        <RadialGradient id="cf-warm" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset={0} stopColor="#E2C37F" stopOpacity={0.13} />
          <Stop offset={1} stopColor="#E2C37F" stopOpacity={0} />
        </RadialGradient>
        <Pattern id="cf-linen" width={5} height={5} patternUnits="userSpaceOnUse">
          <Path
            d="M0 5 L5 0 M-1 1 L1 -1 M4 6 L6 4"
            stroke="#FFFFFF"
            strokeWidth={0.45}
            opacity={0.05}
          />
          <Path d="M0 0 L5 5" stroke="#000000" strokeWidth={0.45} opacity={0.12} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#cf-navy)" />
      <Rect x={0} y={0} width={width} height={height} fill="url(#cf-linen)" />
      <Ellipse
        cx={cx}
        cy={below + (height - below) / 2}
        rx={width * 0.55}
        ry={(height - below) * 0.7}
        fill="url(#cf-warm)"
      />
      <Rect
        x={FRAME}
        y={FRAME}
        width={width - FRAME * 2}
        height={height - FRAME * 2}
        rx={radius - FRAME / 2}
        fill="none"
        stroke="url(#cf-foil)"
        strokeWidth={1.1}
      />
      <Rect
        x={FRAME_INNER}
        y={FRAME_INNER}
        width={width - FRAME_INNER * 2}
        height={height - FRAME_INNER * 2}
        rx={radius - FRAME_INNER / 2}
        fill="none"
        stroke="url(#cf-foil)"
        strokeWidth={0.55}
        opacity={0.75}
      />
      <Rect
        x={window.x - 4.5}
        y={window.y - 4.5}
        width={window.size + 9}
        height={window.size + 9}
        rx={3.5}
        fill="none"
        stroke="url(#cf-foil)"
        strokeWidth={0.55}
        opacity={0.8}
      />
    </Svg>
  );
});

/** The fine foil line on the scene's own edge, drawn over the picture. */
export function WindowLine({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} style={{ position: 'absolute' }} pointerEvents="none">
      <Defs>
        <LinearGradient
          id="cw-foil"
          x1={0}
          y1={0}
          x2={size}
          y2={size}
          gradientUnits="userSpaceOnUse"
        >
          {foilStops()}
        </LinearGradient>
      </Defs>
      <Rect
        x={0.6}
        y={0.6}
        width={size - 1.2}
        height={size - 1.2}
        rx={2}
        fill="none"
        stroke="url(#cw-foil)"
        strokeWidth={1.2}
      />
    </Svg>
  );
}
