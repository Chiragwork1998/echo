import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthenticationError, type AuthProvider } from './auth.js';
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

export function createBearerAuthentication(
  authProvider: AuthProvider,
  authStore: AuthStore,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function authenticate(request): Promise<void> {
    const authorization = request.headers.authorization;
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');
    if (!match?.[1]) throw new AuthenticationError();
    const identity = await authProvider.verifyAccessToken(match[1]);
    const account = await authStore.findAccount(identity);
    if (!account) throw new AuthenticationError();
    request.authenticatedAccount = { account, accessToken: match[1] };
  };
}
