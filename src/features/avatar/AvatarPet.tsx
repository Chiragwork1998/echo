import { useEffect, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { useReduceMotion } from '@/design/press';
import type { AvatarId } from './catalog';

export type AvatarPetProps = {
  id: AvatarId;
  size?: number;
  animated?: boolean;
  mood?: 'idle' | 'thinking' | 'speaking';
};

/** Small original vector sprites: crisp at phone sizes, without bitmap downloads. */
export function AvatarPet({ id, size = 64, animated = false, mood = 'idle' }: AvatarPetProps) {
  const reduced = useReduceMotion();
  const [float] = useState(() => new Animated.Value(0));
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (!animated || reduced || id === 'none') {
      float.setValue(0);
      return;
    }
    const duration = mood === 'speaking' ? 720 : mood === 'thinking' ? 1050 : 1700;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: -2, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(float, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => { loop.stop(); float.setValue(0); };
  }, [animated, float, id, mood, reduced]);

  useEffect(() => {
    if (!animated || reduced || id === 'none') return;
    let reopen: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setBlink(true);
      reopen = setTimeout(() => setBlink(false), 120);
    }, 4200);
    return () => { clearInterval(interval); if (reopen) clearTimeout(reopen); setBlink(false); };
  }, [animated, id, reduced]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: size, height: size, transform: [{ translateY: float }] }}
    >
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {id !== 'none' ? <Ellipse cx={32} cy={60} rx={16} ry={2} fill="#07101C" opacity={0.16} /> : null}
        {sprite(id, blink)}
      </Svg>
    </Animated.View>
  );
}

function Eyes({ x = 26, y = 32, gap = 11, color = '#252134', blink = false }: {
  x?: number; y?: number; gap?: number; color?: string; blink?: boolean;
}) {
  return <G fill={color}><Rect x={x} y={y + (blink ? 2 : 0)} width={3} height={blink ? 1 : 5} rx={0.8} /><Rect x={x + gap} y={y + (blink ? 2 : 0)} width={3} height={blink ? 1 : 5} rx={0.8} /></G>;
}

function sprite(id: AvatarId, blink: boolean) {
  switch (id) {
    case 'none':
      return <G stroke="#AEB7C5" strokeWidth={1.5} strokeLinecap="round" fill="none" opacity={0.7}><Circle cx={32} cy={32} r={16} /><Path d="M21 43 43 21" /></G>;
    case 'codex':
      return <G>
        <Path d="M23 9h18v4h6v6h5v17h-5v7H17v-5h-5V21h4v-7h7z" fill="#446CEB" />
        <Rect x={20} y={7} width={22} height={16} rx={6} fill="#7297FF" />
        <Rect x={12} y={17} width={18} height={20} rx={7} fill="#6389FF" />
        <Rect x={38} y={16} width={15} height={20} rx={7} fill="#6288FB" />
        <Rect x={19} y={18} width={28} height={22} rx={6} fill="#93C8FF" />
        <Rect x={21} y={20} width={24} height={18} rx={4} fill="#102D58" />
        {blink ? <Path d="M26 29h5m5 0h5" stroke="#72E0FF" strokeWidth={1.8} strokeLinecap="round" /> : <Path d="m27 25 4 4-4 4m8 0h5" stroke="#72E0FF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
        <Rect x={26} y={41} width={14} height={12} rx={4} fill="#6389FF" />
        <Rect x={29} y={43} width={8} height={5} rx={1} fill="#9DCBFF" />
        <Rect x={19} y={43} width={6} height={8} rx={2} fill="#7297FF" />
        <Rect x={41} y={43} width={6} height={8} rx={2} fill="#7297FF" />
        <Rect x={25} y={53} width={6} height={6} rx={2} fill="#446CEB" />
        <Rect x={35} y={53} width={6} height={6} rx={2} fill="#446CEB" />
      </G>;
    case 'dewey':
      return <G>
        <Path d="m32 4 7 10v5l7 6v6l5 6-2 13-9 8H23L14 50l-2-12 5-7v-6l8-7v-5z" fill="#1D9DD2" />
        <Path d="m32 8 5 8v5l7 6v9l4 5-4 10-8 5H25l-9-8 1-10 5-8v-6l6-6z" fill="#58D9F0" />
        <Path d="m29 13-5 8v7h6l7-7-4-8z" fill="#E7FCFF" />
        <Path d="m17 42-8 3 5 5h6m26-8 8 3-5 5h-5" fill="#43C5EB" />
        <Eyes x={24} y={36} gap={13} blink={blink} color="#175484" />
        <Rect x={20} y={43} width={5} height={3} rx={1} fill="#F6A6BB" />
        <Rect x={40} y={43} width={5} height={3} rx={1} fill="#F6A6BB" />
        <Path d="m30 44 2 2 2-2" fill="none" stroke="#175484" strokeWidth={1.4} strokeLinecap="round" />
        <Rect x={22} y={56} width={7} height={4} rx={2} fill="#319BC6" /><Rect x={36} y={56} width={7} height={4} rx={2} fill="#319BC6" />
      </G>;
    case 'fireball':
      return <G>
        <Path d="m32 3 6 10-2 9 7-6 3 10-1 9H19l-2-9 6-10 2 8 4-10z" fill="#FF7934" />
        <Path d="m32 12 3 10-2 6 7-4 1 10H23l1-9 5 4-1-8z" fill="#FFE873" />
        <Rect x={17} y={29} width={31} height={24} rx={7} fill="#DB632A" />
        <Rect x={20} y={30} width={26} height={21} rx={5} fill="#FFCA68" />
        <Rect x={23} y={33} width={20} height={15} rx={4} fill="#FFF0B6" />
        <Eyes x={26} y={36} gap={10} blink={blink} color="#9C4D31" />
        <Rect x={23} y={43} width={4} height={2} fill="#FFB38A" /><Rect x={39} y={43} width={4} height={2} fill="#FFB38A" />
        <Rect x={27} y={52} width={12} height={6} rx={2} fill="#FFBC57" />
        <Rect x={23} y={57} width={7} height={4} rx={1.5} fill="#FF8F39" /><Rect x={36} y={57} width={7} height={4} rx={1.5} fill="#FF8F39" />
        <Rect x={12} y={37} width={5} height={9} rx={2} fill="#FFAB50" /><Rect x={48} y={37} width={5} height={9} rx={2} fill="#FFAB50" />
      </G>;
    case 'hoots':
      return <G>
        <Path d="m16 24 3-12 10 7h7l10-7 3 13" fill="#AD5B20" />
        <Ellipse cx={32} cy={37} rx={22} ry={23} fill="#D97B24" />
        <Ellipse cx={32} cy={40} rx={18} ry={19} fill="#F2A63C" />
        <Path d="M12 30c-6 7-4 17 5 23l2-17m33-6c6 7 4 17-5 23l-2-17" fill="#B96523" />
        <Path d="M17 25c4-7 11-6 15-1 5-5 12-6 16 1v15l-16 9-15-9z" fill="#FFE4A0" />
        <Circle cx={24} cy={32} r={8} fill="none" stroke="#68442C" strokeWidth={2} /><Circle cx={41} cy={32} r={8} fill="none" stroke="#68442C" strokeWidth={2} />
        <Path d="M32 31h2m-19-1-4-1m39 1 4-1" stroke="#68442C" strokeWidth={2} strokeLinecap="round" />
        <Eyes x={23} y={30} gap={17} blink={blink} color="#4B3028" />
        <Path d="m29 38 4 4 4-4z" fill="#C86F20" />
        <Path d="m26 47 2 3m5-3 1 4m6-4-2 3" stroke="#B7742B" strokeWidth={1.5} strokeLinecap="round" />
        <Rect x={20} y={57} width={9} height={4} rx={2} fill="#C77D2F" /><Rect x={36} y={57} width={9} height={4} rx={2} fill="#C77D2F" />
      </G>;
    case 'rocky':
      return <G>
        <Path d="m16 24 7-6 9 2 8-4 10 8 5 17-4 14-13 5-20-4-8-9 1-14z" fill="#756F62" />
        <Path d="m19 23 9-3 8 4 9-4 5 12-1 16-10 8-19-3-7-8 2-14z" fill="#B6AA91" />
        <Path d="m23 21 1-11 7 9 4-14 5 14 7 2-9 5z" fill="#8D8574" />
        <Path d="m27 14 4 8 6-1-1-10 5 12-14 3z" fill="#C1B59B" />
        <Rect x={20} y={30} width={27} height={21} rx={5} fill="#817B6D" />
        <Rect x={23} y={32} width={21} height={17} rx={3} fill="#E3D7C6" />
        <Eyes x={26} y={36} gap={10} blink={blink} color="#4B4141" />
        <Rect x={23} y={43} width={4} height={2} fill="#D5B2AC" /><Rect x={39} y={43} width={4} height={2} fill="#D5B2AC" />
        <Path d="m31 44 2 1 2-1" stroke="#766561" strokeWidth={1.2} fill="none" strokeLinecap="round" />
        <Rect x={12} y={49} width={7} height={9} rx={3} fill="#8F8774" /><Rect x={46} y={48} width={7} height={9} rx={3} fill="#8F8774" />
        <Rect x={23} y={56} width={8} height={5} rx={2} fill="#776E5D" /><Rect x={36} y={56} width={8} height={5} rx={2} fill="#776E5D" />
      </G>;
    case 'seedy':
      return <G>
        <Path d="M33 31V13" stroke="#7A9643" strokeWidth={3} strokeLinecap="round" />
        <Path d="M32 19C21 20 17 15 17 10c10-1 15 2 15 9z" fill="#A7C951" />
        <Path d="M33 15C36 7 45 7 49 10c-2 7-9 9-16 5z" fill="#6EA64A" />
        <Path d="m21 12 10 5m7-4 7-2" stroke="#D0E682" strokeWidth={1.2} strokeLinecap="round" />
        <Rect x={18} y={27} width={31} height={27} rx={7} fill="#8B8D56" />
        <Rect x={20} y={28} width={27} height={23} rx={6} fill="#D9D59A" />
        <Rect x={23} y={31} width={21} height={17} rx={4} fill="#F5EDC5" />
        <Eyes x={26} y={35} gap={10} blink={blink} color="#737344" />
        <Path d="M30 43h6" stroke="#B49D68" strokeWidth={1.3} strokeLinecap="round" />
        <Rect x={27} y={52} width={13} height={6} rx={2} fill="#A1B66A" />
        <Rect x={22} y={57} width={7} height={4} rx={1.5} fill="#829447" /><Rect x={37} y={57} width={7} height={4} rx={1.5} fill="#829447" />
        <Rect x={13} y={39} width={5} height={9} rx={2} fill="#D9D59A" /><Rect x={49} y={39} width={5} height={9} rx={2} fill="#D9D59A" />
      </G>;
    case 'stacky':
      return <G>
        <Path d="M32 13V7m0 0 4-3" stroke="#9F98B6" strokeWidth={1.4} strokeLinecap="round" />
        <Circle cx={37} cy={4} r={1.6} fill="#B6AACF" />
        <StackFace x={22} y={13} width={22} height={13} blink={blink} />
        <StackFace x={19} y={29} width={28} height={13} blink={blink} />
        <StackFace x={16} y={45} width={34} height={13} blink={blink} />
        <Rect x={26} y={26} width={13} height={3} fill="#3A344B" /><Rect x={25} y={42} width={16} height={3} fill="#3A344B" />
        <Rect x={12} y={48} width={4} height={7} rx={1} fill="#655778" /><Rect x={50} y={48} width={4} height={7} rx={1} fill="#655778" />
        <Rect x={23} y={58} width={7} height={3} rx={1} fill="#55475F" /><Rect x={38} y={58} width={7} height={3} rx={1} fill="#55475F" />
      </G>;
    case 'bsod':
      return <G>
        <Path d="m33 18 3-8" stroke="#B8D9EA" strokeWidth={1.7} strokeLinecap="round" /><Circle cx={37} cy={8} r={3} fill="#4AAEF6" /><Circle cx={36} cy={7} r={1} fill="#CBF2FF" />
        <Rect x={16} y={19} width={34} height={28} rx={6} fill="#7F9CAB" />
        <Rect x={18} y={18} width={31} height={27} rx={5} fill="#E5EDF1" />
        <Rect x={21} y={21} width={25} height={21} rx={3} fill="#159EF2" />
        <Path d="M24 24h5m-5 0v5" stroke="#A5ECFF" strokeWidth={1.3} strokeLinecap="round" fill="none" />
        <Eyes x={27} y={27} gap={10} blink={blink} color="#F4FCFF" />
        <Path d="m30 36 3-1 4 1" stroke="#F4FCFF" strokeWidth={1.4} strokeLinecap="round" fill="none" />
        <Rect x={26} y={46} width={16} height={10} rx={3} fill="#DAE4E8" />
        <Rect x={31} y={48} width={6} height={5} rx={1} fill="#3C9AE0" />
        <Rect x={18} y={48} width={6} height={7} rx={2} fill="#DBE7EC" /><Rect x={44} y={48} width={6} height={7} rx={2} fill="#DBE7EC" />
        <Rect x={25} y={56} width={6} height={5} rx={1.5} fill="#A0B5BF" /><Rect x={37} y={56} width={6} height={5} rx={1.5} fill="#A0B5BF" />
      </G>;
    case 'null-signal':
      return <G>
        <Path d="M33 23v-7c-9-2-6-11-1-11 5 0 8 7 3 9" stroke="#696277" strokeWidth={1.5} strokeLinecap="round" fill="none" />
        <Path d="m22 24 6-6h11l7 7v26l-5 6H24l-5-7V30z" fill="#292632" stroke="#62596D" strokeWidth={1} />
        <Rect x={24} y={26} width={19} height={24} rx={4} fill="#12141E" />
        <Path d="M27 36v-5l3 5v-5m2 0v5h3v-5m2 0v5h2m2-5v5h2" stroke="#DC687A" strokeWidth={0.85} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={blink ? 0.55 : 1} />
        <Path d="M28 43h10" stroke="#635272" strokeWidth={1} strokeLinecap="round" />
        <Rect x={14} y={34} width={5} height={13} rx={2} fill="#312A3D" /><Rect x={46} y={34} width={5} height={13} rx={2} fill="#312A3D" />
        <Rect x={26} y={56} width={6} height={6} rx={2} fill="#231F2B" stroke="#62596D" strokeWidth={0.6} /><Rect x={36} y={56} width={6} height={6} rx={2} fill="#231F2B" stroke="#62596D" strokeWidth={0.6} />
      </G>;
  }
}

function StackFace({ x, y, width, height, blink }: { x: number; y: number; width: number; height: number; blink: boolean }) {
  return <G><Rect x={x} y={y} width={width} height={height} rx={3} fill="#544760" /><Rect x={x + 2} y={y + 2} width={width - 4} height={height - 4} rx={2} fill="#A496BA" /><Rect x={x + 5} y={y + 3} width={width - 10} height={height - 6} rx={2} fill="#2B2A40" /><Eyes x={x + 7} y={y + 4} gap={width - 17} color="#C5B4DB" blink={blink} /></G>;
}
