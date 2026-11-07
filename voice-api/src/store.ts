// Where counters live: how much of an allowance an install has used, how much the whole server has
// spent today, and short-lived notes such as an install's plan. The routes see only `QuotaStore`.
// Production uses Upstash Redis through its REST API, so the counts hold across every instance and
// survive a restart. Tests and local development use memory.
//
// Nothing that is stored is content: keys are hashed install ids, dates and feature names, and values
// are numbers or a plan name. Nothing here logs.

export type Counter = {
  key: string;
  /** What this request adds: milliseconds of audio, or a count. Never negative. */
  amount: number;
  /** The most the counter may hold once this is added. null: count, but never refuse. */
  limit: number | null;
  /** When the counter may be forgotten, in unix seconds. null: never (an allowance for ever). */
  expireAt: number | null;
};

export type Spent =
  | { ok: true }
  /** Nothing was kept. `index` is the first counter that would have gone over, `used` what it held. */
  | { ok: false; index: number; used: number };

export interface QuotaStore {
  /**
   * Adds every amount, or none of them. A counter that would go over its limit refuses the whole
   * request and nothing is kept. Two requests racing for the last of an allowance can both be
   * refused, but together they can never be let past it.
   */
  spend(counters: readonly Counter[]): Promise<Spent>;
  /** Takes amounts back, after a request that was let in could not be served. */
  refund(counters: readonly Counter[]): Promise<void>;
  /** What each counter holds now, 0 for one that has never been used. */
  read(keys: readonly string[]): Promise<number[]>;
  getText(key: string): Promise<string | null>;
  setText(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** A store that could not be reached or answered nonsense. The route refuses, rather than count nothing. */
export class StoreError extends Error {
  constructor() {
    super('store_unavailable');
  }
}

// ---------------------------------------------------------------------------------------------
// Memory: one process, so one map is atomic on its own.

export function createMemoryStore(clock: () => number = Date.now): QuotaStore & { size(): number } {
  const counters = new Map<string, { value: number; expireAt: number | null }>();
  const texts = new Map<string, { value: string; expireAt: number }>();
  const live = (expireAt: number | null) => expireAt === null || expireAt * 1000 > clock();
  const value = (key: string) => {
    const held = counters.get(key);
    if (!held) return 0;
    if (!live(held.expireAt)) {
      counters.delete(key);
      return 0;
    }
    return held.value;
  };
  return {
    async spend(wanted) {
      const totals = wanted.map(({ key, amount }) => value(key) + amount);
      const over = wanted.findIndex(({ limit }, index) => limit !== null && totals[index]! > limit);
      if (over >= 0) return { ok: false, index: over, used: value(wanted[over]!.key) };
      for (const { key, amount, expireAt } of wanted) {
        counters.set(key, { value: value(key) + amount, expireAt });
      }
      return { ok: true };
    },
    async refund(given) {
      for (const { key, amount } of given) {
        const held = counters.get(key);
        if (held && live(held.expireAt)) held.value = Math.max(0, held.value - amount);
      }
    },
    async read(keys) {
      return keys.map(value);
    },
    async getText(key) {
      const held = texts.get(key);
      if (!held) return null;
      if (held.expireAt <= clock()) {
        texts.delete(key);
        return null;
      }
      return held.value;
    },
    async setText(key, text, ttlSeconds) {
      texts.set(key, { value: text, expireAt: clock() + ttlSeconds * 1000 });
    },
    size: () => counters.size + texts.size,
  };
}

// ---------------------------------------------------------------------------------------------
// Upstash Redis, over HTTPS. Each request is one transaction (MULTI/EXEC through /multi-exec), and a
// refusal is a second one that takes the amounts back. Counters only ever go up inside a transaction
// and come down only for a request that was refused or not served, so whatever interleaves, a
// request is let in only if its own addition kept every counter within its limit: the requests let in
// never add up to more than a limit. Two requests racing at the very edge may both be refused.

export type UpstashConfig = { url: string; token: string; fetch: typeof fetch; timeoutMs?: number };

type Reply = { result?: unknown; error?: string };

export function createUpstashStore(config: UpstashConfig): QuotaStore {
  const base = config.url.replace(/\/+$/, '');
  const call = async (path: string, body: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await config.fetch(`${base}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs ?? 4_000),
      });
    } catch {
      throw new StoreError();
    }
    if (!response.ok) throw new StoreError();
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new StoreError();
    }
  };
  /** Commands run as one transaction. Every reply must be a result, not an error. */
  const transaction = async (commands: (string | number)[][]): Promise<unknown[]> => {
    if (commands.length === 0) return [];
    const replies = await call('/multi-exec', commands.map((command) => command.map(String)));
    if (!Array.isArray(replies) || replies.length !== commands.length) throw new StoreError();
    return replies.map((reply: Reply) => {
      if (typeof reply !== 'object' || reply === null || reply.error !== undefined) {
        throw new StoreError();
      }
      return reply.result;
    });
  };
  const single = async (command: (string | number)[]): Promise<unknown> => {
    const reply = (await call('/', command.map(String))) as Reply;
    if (typeof reply !== 'object' || reply === null || reply.error !== undefined) {
      throw new StoreError();
    }
    return reply.result;
  };
  const asNumber = (value: unknown) => {
    const number = typeof value === 'number' ? value : Number(value ?? 0);
    if (!Number.isFinite(number)) throw new StoreError();
    return number;
  };

  const refund = async (given: readonly Counter[]) => {
    const commands: (string | number)[][] = [];
    for (const { key, amount, expireAt } of given) {
      if (amount <= 0) continue;
      commands.push(['DECRBY', key, Math.round(amount)]);
      // A counter that expired while the request ran is made again by DECRBY, so it is given its
      // time again too, rather than left to last for ever.
      if (expireAt !== null) commands.push(['EXPIREAT', key, expireAt]);
    }
    await transaction(commands);
  };

  return {
    refund,
    async spend(wanted) {
      if (wanted.length === 0) return { ok: true };
      const commands: (string | number)[][] = [];
      for (const { key, amount, expireAt } of wanted) {
        commands.push(['INCRBY', key, Math.round(amount)]);
        // The same moment every time, so setting it again changes nothing.
        if (expireAt !== null) commands.push(['EXPIREAT', key, expireAt]);
      }
      const replies = await transaction(commands);
      const totals: number[] = [];
      let at = 0;
      for (const { expireAt } of wanted) {
        totals.push(asNumber(replies[at]));
        at += expireAt === null ? 1 : 2;
      }
      const over = wanted.findIndex(({ limit }, index) => limit !== null && totals[index]! > limit);
      if (over < 0) return { ok: true };
      // Taken back at once. If this fails the counts stay high, which costs the person a little and
      // ECHO nothing, and never lets anyone past a limit.
      await refund(wanted).catch(() => undefined);
      return { ok: false, index: over, used: totals[over]! - Math.round(wanted[over]!.amount) };
    },
    async read(keys) {
      if (keys.length === 0) return [];
      const replies = await transaction(keys.map((key) => ['GET', key]));
      return replies.map(asNumber);
    },
    async getText(key) {
      const result = await single(['GET', key]);
      return typeof result === 'string' ? result : null;
    },
    async setText(key, value, ttlSeconds) {
      await single(['SET', key, value, 'EX', Math.max(1, Math.round(ttlSeconds))]);
    },
  };
}

// ---------------------------------------------------------------------------------------------

export type StoreChoice = { store: QuotaStore; durable: boolean };

let shared: StoreChoice | null = null;

/**
 * The store for this instance. Upstash when it is configured, under either the names Upstash uses or
 * the ones the Vercel Marketplace sets. Otherwise memory, which holds only for one instance and only
 * until it restarts: fine for development and tests, and named in the log so production without it
 * is noticed.
 */
export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): StoreChoice {
  if (shared) return shared;
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  shared =
    url && token && /^https:\/\//.test(url)
      ? { store: createUpstashStore({ url, token, fetch: (input, init) => fetch(input, init) }), durable: true }
      : { store: createMemoryStore(), durable: false };
  // Said once per instance on Vercel, where memory is a mistake. Silent on this Mac and in tests.
  if (!shared.durable && env.VERCEL_ENV) console.log(JSON.stringify({ store: 'memory', durable: false }));
  return shared;
}

/** Tests only: use this store, or forget the one chosen so the environment is read again. */
export function useStore(choice: StoreChoice | null) {
  shared = choice;
}
