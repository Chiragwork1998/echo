// The web preview has no storage, and nothing a person does there may persist (src/storage/
// runtime.web.ts), so whose book this is lives in memory for one page load. A preview never asks,
// unless the visual harness pins the question or a name (qaPins.ts: ?name=ask, ?name=named), so the
// moment can be looked at. The pinned name is made up and belongs to no one.
import { namePin } from './qaPins';
import type { OwnerRecord, StoreResult } from './ownerStore';

export type { OwnerRecord, StoreResult } from './ownerStore';

let held: OwnerRecord | null = null;

function first(): OwnerRecord {
  const pin = namePin();
  if (pin?.kind === 'named') return { v: 1, name: pin.name, asked: true, namedOpens: pin.opens };
  return { v: 1, name: null, asked: pin?.kind !== 'ask', namedOpens: 0 };
}

export async function loadOwner(): Promise<StoreResult<OwnerRecord>> {
  held ??= first();
  return { ok: true, value: held };
}

export async function saveOwner(record: OwnerRecord): Promise<StoreResult<null>> {
  held = record;
  return { ok: true, value: null };
}
