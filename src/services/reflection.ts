/**
 * Reflection boundary. Saving an entry never depends on reflection: when the
 * service is unavailable or offline the entry is still committed privately.
 */

export type ReflectionInput = {
  entryId: string;
  promptId: string;
  /** Plaintext is only ever sent over TLS after explicit consent. */
  body: string;
  consentVersion: string;
};

export type ReflectionResult =
  | { status: 'complete'; text: string }
  | { status: 'pending'; jobId: string }
  | { status: 'unavailable' }
  | { status: 'offline' }
  | { status: 'error'; retryable: boolean };

export interface ReflectionPort {
  availability(): Promise<'available' | 'unavailable'>;
  request(input: ReflectionInput): Promise<ReflectionResult>;
}

export const reflectionService: ReflectionPort = {
  async availability() {
    return 'unavailable';
  },
  async request() {
    return { status: 'unavailable' };
  },
};
