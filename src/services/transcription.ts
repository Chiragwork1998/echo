import * as Crypto from 'expo-crypto';

import {
  decryptAudioToCache,
  deleteFileIfPresent,
  isEncryptedAudioPath,
} from '@/storage/audioStore';

import {
  ApiRequestError,
  ApiTransportError,
  ApiUnauthenticatedError,
  UPLOAD_REQUEST_TIMEOUT_MS,
  request,
  resolveApiBaseUrl,
} from './api';
import { getAccessToken } from './auth';
import type { VoiceDraft } from './voice';

/**
 * Server-side speech-to-text (`docs/API_CONTRACT.md`, reflection service).
 *
 * Transcription runs behind the authenticated Fastify API: the audio is
 * decrypted to a cache file for exactly one multipart upload, then deleted.
 * The client holds no provider credential and never sends plaintext anywhere
 * except this consented, TLS-protected endpoint.
 *
 * Assumption recorded for review: the contract lists reflection but not the
 * transcription route, so this client targets `POST /v1/transcriptions` on the
 * same authenticated contract and same error envelope.
 */

export const TRANSCRIPTION_PATH = '/transcriptions';

export type TranscriptionResult =
  | { status: 'complete'; text: string }
  | { status: 'unavailable' }
  | { status: 'unauthenticated' }
  | { status: 'error'; retryable: boolean };

export interface TranscriptionPort {
  available(): boolean;
  transcribe(draft: VoiceDraft): Promise<TranscriptionResult>;
}

function mimeTypeFor(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.caf')) {
    return 'audio/x-caf';
  }
  if (lower.endsWith('.wav')) {
    return 'audio/wav';
  }
  if (lower.endsWith('.webm')) {
    return 'audio/webm';
  }
  if (lower.endsWith('.3gp')) {
    return 'audio/3gpp';
  }
  return 'audio/mp4';
}

export const transcriptionService: TranscriptionPort = {
  available() {
    return resolveApiBaseUrl() !== null;
  },

  async transcribe(draft: VoiceDraft): Promise<TranscriptionResult> {
    const baseUrl = resolveApiBaseUrl();
    if (!baseUrl || !draft.localPath) {
      return { status: 'unavailable' };
    }
    if (!(await getAccessToken())) {
      return { status: 'unauthenticated' };
    }

    let uploadUri = draft.localPath;
    let temporary = false;
    try {
      if (isEncryptedAudioPath(draft.localPath)) {
        uploadUri = await decryptAudioToCache(draft.localPath, Crypto.randomUUID());
        temporary = true;
      }
      const formData = new FormData();
      formData.append('audio', {
        uri: uploadUri,
        name: 'echo-recording',
        type: mimeTypeFor(uploadUri),
      } as unknown as Blob);
      formData.append('durationSeconds', `${draft.durationSeconds}`);

      const response = await request<{ text?: string }>(
        { baseUrl, accessToken: getAccessToken },
        {
          method: 'POST',
          path: TRANSCRIPTION_PATH,
          formData,
          idempotencyKey: Crypto.randomUUID(),
          timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
        },
      );
      if (typeof response.text !== 'string' || response.text.length === 0) {
        return { status: 'error', retryable: true };
      }
      return { status: 'complete', text: response.text };
    } catch (error) {
      if (error instanceof ApiUnauthenticatedError) {
        return { status: 'unauthenticated' };
      }
      if (error instanceof ApiTransportError) {
        return { status: 'error', retryable: true };
      }
      if (error instanceof ApiRequestError) {
        return { status: 'error', retryable: error.retryable };
      }
      return { status: 'error', retryable: false };
    } finally {
      if (temporary) {
        deleteFileIfPresent(uploadUri);
      }
    }
  },
};
