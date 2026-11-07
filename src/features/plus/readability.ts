/**
 * The handoff's readability gradients (design/tokens.json, gradient.readabilityTop and
 * readabilityBottom) as expo-linear-gradient props, read from the token strings themselves so that
 * nothing is copied and nothing can drift. `transparent` keeps the colour before it, at no opacity,
 * so the fade never passes through grey.
 */
export type GradientProps = {
  colors: [string, string, ...string[]];
  locations: [number, number, ...number[]];
  start: { x: number; y: number };
  end: { x: number; y: number };
};

const STOP = /(rgba?\([^)]*\)|transparent|#[0-9a-fA-F]{3,8})\s+([\d.]+)%/g;

function clearOf(color: string | undefined): string {
  const match = color?.match(/rgba?\(([^,]+),([^,]+),([^,)]+)/);
  return match
    ? `rgba(${match[1]!.trim()},${match[2]!.trim()},${match[3]!.trim()},0)`
    : 'transparent';
}

export function gradientFrom(css: string): GradientProps {
  const angle = Number(/linear-gradient\(\s*(-?[\d.]+)deg/.exec(css)?.[1] ?? 180);
  const colors: string[] = [];
  const locations: number[] = [];
  for (const [, raw, at] of css.matchAll(STOP)) {
    colors.push(raw === 'transparent' ? clearOf(colors.at(-1)) : raw!);
    locations.push(Number(at) / 100);
  }
  if (colors.length < 2) throw new Error(`Not a gradient this reads: ${css}`);
  // 180deg runs from the top down. 0deg runs from the bottom up.
  const down = angle % 360 === 180;
  return {
    colors: colors as GradientProps['colors'],
    locations: locations as GradientProps['locations'],
    start: { x: 0.5, y: down ? 0 : 1 },
    end: { x: 0.5, y: down ? 1 : 0 },
  };
}
