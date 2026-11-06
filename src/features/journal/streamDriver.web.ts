import type { StreamDriver } from './streamDriver';

export type { PcmTap, StreamDriver } from './streamDriver';

export const STREAM_EXTENSION = '';

/** No live words on the web preview: a browser must never hold journal audio. */
export const useStreamDriver = (): StreamDriver | null => null;
