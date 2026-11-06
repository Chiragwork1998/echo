import type { RecorderDriver } from './recorderDriver';

export type { RecorderDriver } from './recorderDriver';

export const RECORDER_EXTENSION = '';

/** Recording is off on the web preview: a browser must never hold journal audio. */
export const useRecorderDriver = (): RecorderDriver | null => null;
