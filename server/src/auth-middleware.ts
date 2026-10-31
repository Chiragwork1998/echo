import { randomBytes } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  AuthenticationError,
  type AuthProvider,
  type VerifiedIdentity,
} from './auth.js';
import type { AccountRecord, AuthStore } from './database.js';

export interface AuthenticatedAccount {
  account: AccountRecord;
  accessToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedAccount: AuthenticatedAccount | null;
  }
}

/**
 * The mobile app signs in with Supabase directly and never calls
 * /v1/auth/exchange, so a verified identity may not have an account yet.
 * createSession already performs the race-safe find-or-create (and refuses
 * deleted accounts); the session it records holds a random hash that is never
 * disclosed and expires in a minute, so it can never be redeemed.
 */
// ponytail: inert session row per first sign-in; add AuthStore.ensureAccount if those rows matter.
async function provisionAccount(
  authStore: AuthStore,
  identity: VerifiedIdentity,
): Promise<AccountRecord> {
  try {
    return await authStore.createSession(
      identity,
      randomBytes(32),
      new Date(Date.now() + 60_000),
    );
  } catch {
    throw new AuthenticationError();
  }
}

export function createBearerAuthentication(
  authProvider: AuthProvider,
  authStore: AuthStore,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function authenticate(request): Promise<void> {
    const authorization = request.headers.authorization;
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');
    if (!match?.[1]) throw new AuthenticationError();
    const identity = await authProvider.verifyAccessToken(match[1]);
    const account =
      (await authStore.findAccount(identity)) ??
      (await provisionAccount(authStore, identity));
    request.authenticatedAccount = { account, accessToken: match[1] };
  };
}
