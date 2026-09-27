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
  DeviceRecord,
  DeviceStore,
  ProfilePatch,
  RegisterDeviceInput,
  RegisterDeviceResult,
  RevokeDeviceInput,
  RevokeDeviceResult,
} from '../src/database.js';
import {
  DeviceConflictError,
  IdempotencyKeyReusedError,
} from '../src/errors.js';

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

interface FakeDeviceEntry {
  accountId: string;
  device: DeviceRecord;
  publicKey: Buffer;
}

interface FakeIdempotencyEntry {
  hash: string;
  status: number;
  resourceId: string;
}

interface FakeSessionEntry {
  accountId: string;
  deviceId: string;
  revokedAt: string | null;
}

export class FakeDeviceStore implements DeviceStore {
  readonly #devices = new Map<string, FakeDeviceEntry>();
  readonly #idempotency = new Map<string, FakeIdempotencyEntry>();
  // Mirrors echo.sessions so tests can prove revocation stays account-scoped.
  readonly #sessions = new Map<string, FakeSessionEntry>();

  #identity(accountId: string, scope: string, key: string): string {
    return `${accountId}:${scope}:${key}`;
  }

  #replay(
    accountId: string,
    scope: string,
    key: string,
    requestHash: Buffer,
  ): FakeIdempotencyEntry | null {
    const entry = this.#idempotency.get(this.#identity(accountId, scope, key));
    if (!entry) return null;
    if (entry.hash !== requestHash.toString('hex'))
      throw new IdempotencyKeyReusedError();
    return entry;
  }

  registerDevice({
    accountId,
    registration,
    idempotencyKey,
    requestHash,
  }: RegisterDeviceInput): Promise<RegisterDeviceResult> {
    const replay = this.#replay(
      accountId,
      'device.register',
      idempotencyKey,
      requestHash,
    );
    if (replay) {
      const existing = this.#devices.get(replay.resourceId);
      if (!existing) throw new Error('Idempotent device replay failed');
      return Promise.resolve({
        device: existing.device,
        status: replay.status === 201 ? 201 : 200,
        replayed: true,
      });
    }

    const existing = this.#devices.get(registration.deviceId);
    if (existing && existing.accountId !== accountId)
      throw new DeviceConflictError();

    const now = new Date().toISOString();
    let device: DeviceRecord;
    let status: 200 | 201;
    if (existing) {
      status = 200;
      device = {
        ...existing.device,
        platform: registration.platform,
        appVersion: registration.appVersion,
        lastSeenAt: now,
        revokedAt: null,
      };
    } else {
      status = 201;
      device = {
        id: registration.deviceId,
        platform: registration.platform,
        appVersion: registration.appVersion,
        createdAt: now,
        lastSeenAt: now,
        revokedAt: null,
      };
    }
    this.#devices.set(registration.deviceId, {
      accountId,
      device,
      publicKey: registration.publicKey,
    });
    this.#idempotency.set(
      this.#identity(accountId, 'device.register', idempotencyKey),
      { hash: requestHash.toString('hex'), status, resourceId: device.id },
    );
    return Promise.resolve({ device, status, replayed: false });
  }

  revokeDevice({
    accountId,
    deviceId,
    idempotencyKey,
    requestHash,
  }: RevokeDeviceInput): Promise<RevokeDeviceResult> {
    const replay = this.#replay(
      accountId,
      'device.revoke',
      idempotencyKey,
      requestHash,
    );
    if (replay) return Promise.resolve({ replayed: true });

    const existing = this.#devices.get(deviceId);
    if (existing && existing.accountId === accountId) {
      const now = new Date().toISOString();
      if (existing.device.revokedAt === null) {
        this.#devices.set(deviceId, {
          ...existing,
          device: { ...existing.device, revokedAt: now, lastSeenAt: now },
        });
      }
      // Only the owning account's sessions for this device are revoked. A
      // foreign or unknown device revokes nothing.
      for (const [sessionId, session] of this.#sessions) {
        if (
          session.accountId === accountId &&
          session.deviceId === deviceId &&
          session.revokedAt === null
        ) {
          this.#sessions.set(sessionId, { ...session, revokedAt: now });
        }
      }
    }
    this.#idempotency.set(
      this.#identity(accountId, 'device.revoke', idempotencyKey),
      { hash: requestHash.toString('hex'), status: 204, resourceId: deviceId },
    );
    return Promise.resolve({ replayed: false });
  }

  devicesForAccount(accountId: string): DeviceRecord[] {
    return [...this.#devices.values()]
      .filter((entry) => entry.accountId === accountId)
      .map((entry) => entry.device);
  }

  device(deviceId: string): DeviceRecord | undefined {
    return this.#devices.get(deviceId)?.device;
  }

  addSession(sessionId: string, accountId: string, deviceId: string): void {
    this.#sessions.set(sessionId, { accountId, deviceId, revokedAt: null });
  }

  session(
    sessionId: string,
  ):
    | { accountId: string; deviceId: string; revokedAt: string | null }
    | undefined {
    return this.#sessions.get(sessionId);
  }
}
