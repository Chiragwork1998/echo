import { create } from 'zustand';

import type { SqlDb, WriteQueue } from '@/storage/ports';

import { billing } from './billing';
import type { BillingOff } from './keys';
import type { Entitlement } from './types';

// Kept in the plain preferences table beside the theme. None of it is journal content: a subscription
// state, and two facts about what the person has already been offered or used. "Delete everything"
// empties the table, so all three go with it, and the store's own answer comes back on the next check.
const STATUS_KEY = 'plus.status';
const OFFERED_KEY = 'plus.offered';
const READING_KEY = 'plus.reading';

export type PlusMemory = {
  /** Null while ECHO Plus can be sold in this build. Otherwise why not: every Plus feature is open. */
  off: BillingOff | null;
  /** What the store last said, or 'unknown' before it has said anything, this launch or the last. */
  status: 'unknown' | 'free' | 'plus';
  trial: boolean;
  expiresAt: number | null;
  willRenew: boolean;
  managementURL: string | null;
  /** live: the store answered this launch. cache: carried over from the last one. */
  source: 'none' | 'cache' | 'live';
  /** The paywall that follows onboarding has been shown. It never shows again. */
  offered: boolean;
  /** The free pattern reading has been made. Every reading after it is ECHO Plus. */
  readingUsed: boolean;
};

const initial = (off: BillingOff | null): PlusMemory => ({
  off,
  status: 'unknown',
  trial: false,
  expiresAt: null,
  willRenew: false,
  managementURL: null,
  source: 'none',
  offered: false,
  readingUsed: false,
});

/**
 * Plus in memory. In memory only until the gate has hydrated it, and always on web. It starts from
 * the build itself: a build with no usable key is known to be without billing from the first frame,
 * so nothing is ever gated in it, not even before start-up has run.
 */
export const usePlusStore = create<PlusMemory>(() => initial(billing.off));

/**
 * Whether this person has ECHO Plus right now. A build that cannot sell Plus treats everyone as
 * having it, so that no build without billing ever locks anyone out of anything.
 */
export const hasPlus = (state: PlusMemory): boolean =>
  state.off !== null || state.status === 'plus';

/** The paywall that follows onboarding, once: only where Plus can be bought, to someone without it. */
export const shouldOfferPlus = (state: PlusMemory): boolean =>
  state.off === null && !state.offered && state.status !== 'plus';

let persist: ((key: string, value: string | null) => Promise<unknown>) | null = null;

// A value that fails to save costs one launch of the last known status, or one more offer. Neither
// may disturb anything else.
const save = (key: string, value: string | null) =>
  void persist?.(key, value).catch(() => undefined);

type Cached = Pick<PlusMemory, 'status' | 'trial' | 'expiresAt' | 'willRenew'>;

function parseCached(value: string | undefined): Cached | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { status, trial, expiresAt, willRenew } = parsed as Record<string, unknown>;
    if (status !== 'free' && status !== 'plus') return null;
    return {
      status,
      trial: trial === true,
      expiresAt: typeof expiresAt === 'number' && Number.isFinite(expiresAt) ? expiresAt : null,
      willRenew: willRenew === true,
    };
  } catch {
    return null;
  }
}

function saveStatus(state: PlusMemory): void {
  if (state.status === 'unknown') return;
  const { status, trial, expiresAt, willRenew } = state;
  save(STATUS_KEY, JSON.stringify({ status, trial, expiresAt, willRenew }));
}

/** What the store said, this launch. Kept, so that the next launch knows it before the store answers. */
export function applyEntitlement(entitlement: Entitlement): void {
  const { status, trial, expiresAt, willRenew, managementURL } = entitlement;
  usePlusStore.setState({ status, trial, expiresAt, willRenew, managementURL, source: 'live' });
  saveStatus(usePlusStore.getState());
}

/** This build cannot sell Plus after all, such as a key RevenueCat rejects: everything stays open. */
export function setBillingOff(off: BillingOff | null): void {
  usePlusStore.setState({ off });
}

export function markOffered(): void {
  if (usePlusStore.getState().offered) return;
  usePlusStore.setState({ offered: true });
  save(OFFERED_KEY, '1');
}

export function markReadingUsed(): void {
  if (usePlusStore.getState().readingUsed) return;
  usePlusStore.setState({ readingUsed: true });
  save(READING_KEY, '1');
}

/**
 * Loads what the last launch knew, then turns saving on. An answer the store has already given this
 * launch is newer than anything saved, so it is kept, and saved now that it can be. Runs again after
 * "Delete everything", which empties the table: the two flags clear with it.
 */
export async function hydratePlus(db: SqlDb, serial: WriteQueue = (task) => task()): Promise<void> {
  persist = null;
  const rows = await db.all<{ key: string; value: string }>(
    'SELECT key, value FROM preferences WHERE key IN (?, ?, ?)',
    [STATUS_KEY, OFFERED_KEY, READING_KEY],
  );
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const cached = parseCached(stored.get(STATUS_KEY));
  const now = usePlusStore.getState();
  const status: Partial<PlusMemory> =
    now.source === 'live'
      ? {}
      : cached
        ? { ...cached, managementURL: null, source: 'cache' }
        : { status: 'unknown', trial: false, expiresAt: null, willRenew: false, source: 'none' };
  usePlusStore.setState({
    ...status,
    offered: stored.get(OFFERED_KEY) === '1',
    readingUsed: stored.get(READING_KEY) === '1',
  });
  persist = (key, value) =>
    serial(() =>
      value === null
        ? db.run('DELETE FROM preferences WHERE key = ?', [key])
        : db.run(
            `INSERT INTO preferences (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
            [key, value],
          ),
    );
  if (now.source === 'live') saveStatus(usePlusStore.getState());
}

/** Tests only. */
export function resetPlusStore(patch: Partial<PlusMemory> = {}): void {
  persist = null;
  usePlusStore.setState({ ...initial(billing.off), ...patch });
}
