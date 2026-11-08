import { qa } from '@/testing/qa';

// Visual-harness pins for the opening of the book, in the style of ?receded=1. They exist only in the
// web QA bundle (EXPO_PUBLIC_QA=1): qa.enabled is false in every real app bundle, so none of this runs.
//   ?bookAt=0.5    freezes the cover's swing there, with the book arrived and never opened
//   ?bookRise=0.5  freezes the book part-way through its arrival, the cover still shut
//   ?volume=tides  the volume the daily book is made of, so every cloth can be looked at
//   ?opens=5       how many times the book has opened, so the practised ritual can be looked at
function params() {
  return new URLSearchParams(window.location.search);
}

function unit(name: string): number | undefined {
  if (!qa.enabled) return undefined;
  const raw = params().get(name);
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

export const coverPin = () => unit('bookAt');
export const risePin = () => unit('bookRise');
export const volumePin = (): string | undefined =>
  qa.enabled ? (params().get('volume') ?? undefined) : undefined;
export const opensPin = (): number | undefined => {
  if (!qa.enabled) return undefined;
  const raw = params().get('opens');
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
};
