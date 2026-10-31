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
 * Transcription runs behind the Fastify API (Sarvam Saaras v4, no sign-in
 * required): the audio is decrypted to a cache file for exactly one multipart
 * upload, then deleted.
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
    // Voice-to-text works without signing in; a session token is sent when
    // one exists so signed-in use is limited per account rather than per IP.
    const signedIn = (await getAccessToken()) !== null;

    let uploadUri = draft.localPath;
    let temporary = false;
    try {
      if (isEncryptedAudioPath(draft.localPath)) {
        uploadUri = await decryptAudioToCache(draft.localPath, Crypto.randomUUID());
        temporary = true;
      }
      // The server accepts exactly one part and checks the filename extension;
      // it measures duration itself, so nothing else is appended.
      const type = mimeTypeFor(uploadUri);
      const formData = new FormData();
      formData.append('audio', {
        uri: uploadUri,
        name: `echo-recording.${type === 'audio/mp4' ? 'm4a' : type.split('/')[1]}`,
        type,
      } as unknown as Blob);

      const response = await request<{ transcript?: string }>(
        { baseUrl, accessToken: getAccessToken },
        {
          method: 'POST',
          path: TRANSCRIPTION_PATH,
          formData,
          authenticated: signedIn,
          idempotencyKey: Crypto.randomUUID(),
          timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
        },
      );
      if (typeof response.transcript !== 'string' || response.transcript.length === 0) {
        return { status: 'error', retryable: true };
      }
      return { status: 'complete', text: response.transcript };
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
