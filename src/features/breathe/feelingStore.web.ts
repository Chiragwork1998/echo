// The web preview has no storage, and nothing a person does there may persist
// (src/storage/runtime.web.ts), so practices are not counted on web. Under the visual harness only,
// Patterns is given a few weeks of made-up counts, as the web journal is given made-up echoes. They
// belong to no one.
import { addDays, deviceClock } from '@/features/journal/localDay';
import { qa } from '@/testing/qa';

import type { FeelingCounts, StoreResult } from './feelingStore';

export type { Feeling, FeelingCounts, StoreResult, Tally } from './feelingStore';

/**
 * Six practices this week, four of them calmer, and Settle the one most often calmer over the four
 * weeks. The days follow the device's clock, as Patterns' weeks do, so the view never drifts.
 */
function harnessCounts(): FeelingCounts {
  const today = deviceClock.localDay(deviceClock.now());
  return {
    v: 1,
    days: {
      [today]: {
        settle: { practices: 3, calmer: 2, same: 1, unsettled: 0 },
        // One of these two skipped the check.
        ground: { practices: 2, calmer: 1, same: 0, unsettled: 0 },
        heart: { practices: 1, calmer: 1, same: 0, unsettled: 0 },
      },
      [addDays(today, -7)]: { settle: { practices: 2, calmer: 1, same: 0, unsettled: 1 } },
      [addDays(today, -15)]: { soothe: { practices: 1, calmer: 0, same: 1, unsettled: 0 } },
    },
  };
}

export async function loadFeelings(): Promise<StoreResult<FeelingCounts>> {
  return qa.enabled ? { ok: true, value: harnessCounts() } : { ok: false };
}

export async function recordPractice(): Promise<StoreResult<null>> {
  return { ok: false };
}
