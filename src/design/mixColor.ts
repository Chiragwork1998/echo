type Rgba = [number, number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const FUNCTIONAL = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/** Reads the two colour forms the tokens use: #RGB or #RRGGBB, and rgb() or rgba(). Null otherwise. */
export function parseColor(value: string): Rgba | null {
  const text = value.trim();
  const hex = HEX.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    const n = Number.parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const match = FUNCTIONAL.exec(text);
  if (!match) return null;
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4] === undefined ? 1 : Number(match[4]),
  ];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** A colour part-way between two others, straight through RGBA. `t` is 0 at `from` and 1 at `to`. */
export function mixColor(from: string, to: string, t: number): string {
  const a = parseColor(from);
  const b = parseColor(to);
  // Anything unreadable switches at the half-way point rather than guess.
  if (!a || !b) return t < 0.5 ? from : to;
  const mixed = a.map((part, i) => part + ((b[i] ?? part) - part) * t) as Rgba;
  const [r, g, bl, alpha] = mixed;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)}, ${round(alpha)})`;
}

/** Every colour of one set mixed toward the same key of another. Both sets share their keys. */
export function mixColors<T extends Record<string, string>>(from: T, to: T, t: number): T {
  const out: Record<string, string> = {};
  for (const key of Object.keys(to))
    out[key] = mixColor(from[key] ?? to[key] ?? '', to[key] ?? '', t);
  return out as T;
}
