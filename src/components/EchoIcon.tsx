import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

/**
 * The supplied line icons from `assets/echo/icons/`, drawn as typed SVG
 * primitives so they inherit theme color and need no asset transformer.
 * Stroke weights and viewboxes match the source files exactly.
 */

export type EchoIconName =
  | 'bell'
  | 'book'
  | 'cairn-filled'
  | 'cairn-outline'
  | 'home'
  | 'lock'
  | 'mic'
  | 'moon'
  | 'patterns'
  | 'pen'
  | 'play'
  | 'sun'
  | 'sunrise'
  | 'user';

type EchoIconProps = {
  color: string;
  name: EchoIconName;
  opacity?: number;
  size?: number;
};

export function EchoIcon({ color, name, opacity = 1, size = 24 }: EchoIconProps) {
  if (name === 'cairn-filled' || name === 'cairn-outline') {
    const filled = name === 'cairn-filled';
    const stones = [
      { cx: 14, cy: 22, rx: 10, ry: 3 },
      { cx: 14, cy: 16, rx: 7, ry: 3 },
      { cx: 14, cy: 10.5, rx: 4.5, ry: 2.5 },
      { cx: 14, cy: 6, rx: 2.5, ry: 2 },
    ];
    return (
      <Svg height={size} opacity={opacity} viewBox="0 0 28 28" width={size}>
        {stones.map((stone) => (
          <Ellipse
            cx={stone.cx}
            cy={stone.cy}
            fill={filled ? color : 'none'}
            key={`${stone.cx}-${stone.cy}`}
            rx={stone.rx}
            ry={stone.ry}
            stroke={filled ? 'none' : color}
            strokeWidth={filled ? 0 : 1}
          />
        ))}
      </Svg>
    );
  }

  return (
    <Svg height={size} opacity={opacity} viewBox="0 0 24 24" width={size}>
      {renderGlyph(name, color)}
    </Svg>
  );
}

function renderGlyph(name: Exclude<EchoIconName, 'cairn-filled' | 'cairn-outline'>, color: string) {
  switch (name) {
    case 'bell':
      return (
        <Path
          d="M5 17h14l-1.6-2.3V10a5.4 5.4 0 00-10.8 0v4.7L5 17zM10 20h4"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
      );
    case 'book':
      return (
        <Path
          d="M3 5.5A5.5 5.5 0 018.5 4H12v16H8.5A5.5 5.5 0 003 21.5v-16zM21 5.5A5.5 5.5 0 0015.5 4H12v16h3.5a5.5 5.5 0 015.5 1.5v-16z"
          fill="none"
          stroke={color}
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
      );
    case 'home':
      return (
        <Path
          d="M3 11l9-8 9 8v10h-6v-6H9v6H3V11z"
          fill="none"
          stroke={color}
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
      );
    case 'lock':
      return (
        <>
          <Rect fill="none" height={11} rx={2} stroke={color} strokeWidth={1.5} width={14} x={5} y={10} />
          <Path
            d="M8 10V7a4 4 0 018 0v3M12 14v3"
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeWidth={1.5}
          />
        </>
      );
    case 'mic':
      return (
        <>
          <Rect fill="none" height={12} rx={3} stroke={color} strokeWidth={1.5} width={6} x={9} y={3} />
          <Path
            d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3M8 21h8"
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeWidth={1.5}
          />
        </>
      );
    case 'moon':
      return (
        <Path
          d="M20 15.5A8.5 8.5 0 018.5 4 8.5 8.5 0 1020 15.5z"
          fill="none"
          stroke={color}
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
      );
    case 'patterns':
      return (
        <Path
          d="M5 20V12M12 20V4M19 20v-11"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth={1.8}
        />
      );
    case 'pen':
      return (
        <Path
          d="M4 20l4.2-1 10.6-10.6a2.1 2.1 0 00-3-3L5.2 16 4 20zM13.9 7.3l2.8 2.8M4 22h16"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
      );
    case 'play':
      return <Path d="M8 5l11 7-11 7V5z" fill={color} />;
    case 'sun':
      return (
        <>
          <Circle cx={12} cy={12} fill="none" r={4} stroke={color} strokeWidth={1.5} />
          <Path
            d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeWidth={1.5}
          />
        </>
      );
    case 'sunrise':
      return (
        <Path
          d="M4 16a8 8 0 0116 0M2 20h20M12 2v4M4.9 7l2.2 2.1M19.1 7l-2.2 2.1"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth={1.5}
        />
      );
    case 'user':
      return (
        <>
          <Circle cx={12} cy={8} fill="none" r={4} stroke={color} strokeWidth={1.5} />
          <Path
            d="M4 21a8 8 0 0116 0"
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeWidth={1.5}
          />
        </>
      );
    default:
      return null;
  }
}
