import type { AvatarId } from '@/features/avatar/catalog';
import { getAccessToken } from './auth';
import { resolveApiBaseUrl } from './api';

export type CompanionMessage = { role: 'user' | 'assistant'; content: string };
export type CompanionStatus = { available: boolean; model: string; requiresSignIn: boolean };
export type CompanionReply = { reply: string; model: string };

export class CompanionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CompanionError';
    this.code = code;
  }
}

function companionHost(): string {
  const override = process.env.EXPO_PUBLIC_COMPANION_API_BASE_URL?.trim();
  const host = (override || resolveApiBaseUrl() || '').replace(/\/+$/, '');
  let url: URL;
  try { url = new URL(host); } catch {
    throw new CompanionError('unavailable', 'Your companion is not connected yet. Try again in a little while.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new CompanionError('unavailable', 'Your companion is not connected yet. Try again in a little while.');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

async function callCompanion<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 30_000);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      const token = await getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${companionHost()}/v1/companion/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new CompanionError('sign_in_required', 'Sign in from You to talk with your companion.');
      }
      if (response.status === 429) {
        throw new CompanionError('rate_limited', 'Let’s pause for a moment. Your message is still here; try again shortly.');
      }
      throw new CompanionError('unavailable', 'Your companion could not reply just now. Your message is still here.');
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof CompanionError) throw error;
    if (signal?.aborted) throw error;
    throw new CompanionError('connection', 'The connection needs a moment. Your message is still here; please try again.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export function getCompanionStatus(signal?: AbortSignal): Promise<CompanionStatus> {
  return callCompanion<CompanionStatus>('status', undefined, signal);
}

/** Only the messages entered in this conversation cross the network boundary. */
export async function requestCompanionReply(
  avatarId: Exclude<AvatarId, 'none'>,
  messages: readonly CompanionMessage[],
  signal?: AbortSignal,
): Promise<CompanionReply> {
  const latest = messages.at(-1);
  if (!latest || latest.role !== 'user' || !latest.content.trim() || latest.content.length > 1200) {
    throw new CompanionError('invalid_message', 'Write a message of up to 1,200 characters.');
  }
  const history = messages.slice(-12).map(message => ({ role: message.role, content: message.content.slice(0, 1200) }));
  while (history.length > 1 && history.reduce((total, message) => total + message.content.length, 0) > 6000) history.shift();
  const result = await callCompanion<CompanionReply>('reply', {
    avatarId,
    messages: history,
  }, signal);
  if (typeof result.reply !== 'string' || !result.reply.trim()) {
    throw new CompanionError('empty_reply', 'Your companion could not finish that thought. Please try again.');
  }
  return { reply: result.reply.trim(), model: result.model };
}
