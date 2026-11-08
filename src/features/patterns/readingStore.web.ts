// The web preview has no storage, and journal content must never persist in a browser
// (src/storage/runtime.web.ts). Like the web journal, the last reading is held in memory for one
// page load, so that the visual harness can show cards once they are read. Nothing is written.
import { qaHeldReading } from './qaReading';
import type { SavedReading, StoreResult } from './readingStore';

export type { SavedReading, StoreResult } from './readingStore';

// The visual harness can ask for a reading to look at (src/features/patterns/qaReading.ts).
let held: SavedReading | null = qaHeldReading();

export async function loadReading(): Promise<StoreResult<SavedReading | null>> {
  return { ok: true, value: held };
}

export async function saveReading(reading: SavedReading): Promise<StoreResult<null>> {
  held = reading;
  return { ok: true, value: null };
}

export async function clearReading(): Promise<StoreResult<null>> {
  held = null;
  return { ok: true, value: null };
}
