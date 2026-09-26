import { randomUUID } from 'node:crypto';

import {
  AuthenticationError,
  type AuthProvider,
  type AuthProviderName,
  type MagicLinkVerification,
  type ProviderSession,
  type VerifiedIdentity,
} from '../src/auth.js';
import type {
  AccountRecord,
  AuthStore,
  ProfilePatch,
} from '../src/database.js';

export class FakeAuthProvider implements AuthProvider {
  readonly #access = new Map<string, VerifiedIdentity>();
  readonly #refresh = new Map<string, VerifiedIdentity>();
  #sequence = 0;

  #issue(identity: VerifiedIdentity): ProviderSession {
    this.#sequence += 1;
    const sequence = String(this.#sequence);
    const accessToken = `access-${identity.subject}-${sequence}`;
    const refreshToken = `refresh-${identity.subject}-${sequence}`;
    this.#access.set(accessToken, identity);
    this.#refresh.set(refreshToken, identity);
    return { accessToken, refreshToken, expiresIn: 3600, identity };
  }

  exchange(
    provider: Exclude<AuthProviderName, 'email'>,
    assertion: string,
  ): Promise<ProviderSession> {
    if (!assertion.endsWith('-assertion'))
      return Promise.reject(new AuthenticationError());
    return Promise.resolve(
      this.#issue({ provider, subject: assertion.replace(/-assertion$/, '') }),
    );
  }

  requestMagicLink(): Promise<void> {
    return Promise.resolve();
  }

  verifyMagicLink(
    verification: MagicLinkVerification,
  ): Promise<ProviderSession> {
    if ('tokenHash' in verification) {
      if (verification.tokenHash !== 'valid-magic-hash')
        return Promise.reject(new AuthenticationError());
      return Promise.resolve(
        this.#issue({ provider: 'email', subject: 'magic-link-user' }),
      );
    }
    if (verification.token !== 'valid-magic-token')
      return Promise.reject(new AuthenticationError());
    return Promise.resolve(
      this.#issue({ provider: 'email', subject: verification.email }),
    );
  }

  refresh(refreshToken: string): Promise<ProviderSession> {
    const identity = this.#refresh.get(refreshToken);
    if (!identity) return Promise.reject(new AuthenticationError());
    this.#refresh.delete(refreshToken);
    return Promise.resolve(this.#issue(identity));
  }

  verifyAccessToken(accessToken: string): Promise<VerifiedIdentity> {
    const identity = this.#access.get(accessToken);
    return identity
      ? Promise.resolve(identity)
      : Promise.reject(new AuthenticationError());
  }

  logout(accessToken: string): Promise<void> {
    if (!this.#access.delete(accessToken))
      return Promise.reject(new AuthenticationError());
    return Promise.resolve();
  }
}

export class FakeAuthStore implements AuthStore {
  readonly #accounts = new Map<string, AccountRecord>();
  readonly #identityAccounts = new Map<string, string>();
  readonly #sessions = new Map<string, string>();
  sessionExpiries: Date[] = [];

  #identityKey(identity: VerifiedIdentity): string {
    return `${identity.provider}:${identity.subject}`;
  }

  createSession(
    identity: VerifiedIdentity,
    refreshCredentialHash: Buffer,
    expiresAt: Date,
  ): Promise<AccountRecord> {
    const key = this.#identityKey(identity);
    let accountId = this.#identityAccounts.get(key);
    if (!accountId) {
      accountId = randomUUID();
      const now = new Date().toISOString();
      this.#accounts.set(accountId, {
        id: accountId,
        displayName: null,
        locale: 'en',
        timezone: 'UTC',
        createdAt: now,
        updatedAt: now,
      });
      this.#identityAccounts.set(key, accountId);
    }
    this.#sessions.set(refreshCredentialHash.toString('hex'), accountId);
    this.sessionExpiries.push(expiresAt);
    return Promise.resolve(this.#requiredAccount(accountId));
  }

  rotateSession(
    identity: VerifiedIdentity,
    previousHash: Buffer,
    nextHash: Buffer,
    expiresAt: Date,
  ): Promise<AccountRecord | null> {
    const previousKey = previousHash.toString('hex');
    const accountId = this.#sessions.get(previousKey);
    if (
      !accountId ||
      this.#identityAccounts.get(this.#identityKey(identity)) !== accountId
    )
      return Promise.resolve(null);
    this.#sessions.delete(previousKey);
    this.#sessions.set(nextHash.toString('hex'), accountId);
    this.sessionExpiries.push(expiresAt);
    return Promise.resolve(this.#requiredAccount(accountId));
  }

  revokeSession(accountId: string, refreshHash: Buffer): Promise<boolean> {
    const key = refreshHash.toString('hex');
    if (this.#sessions.get(key) !== accountId) return Promise.resolve(false);
    this.#sessions.delete(key);
    return Promise.resolve(true);
  }

  findAccount(identity: VerifiedIdentity): Promise<AccountRecord | null> {
    const accountId = this.#identityAccounts.get(this.#identityKey(identity));
    return Promise.resolve(accountId ? this.#requiredAccount(accountId) : null);
  }

  updateAccount(
    accountId: string,
    patch: ProfilePatch,
  ): Promise<AccountRecord> {
    const current = this.#requiredAccount(accountId);
    const updated = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.#accounts.set(accountId, updated);
    return Promise.resolve(updated);
  }

  #requiredAccount(accountId: string): AccountRecord {
    const account = this.#accounts.get(accountId);
    if (!account) throw new Error('Fake account does not exist');
    return account;
  }
}
