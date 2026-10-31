import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import { supabase } from '@/services/supabase';
import { authService } from '@/services/auth';
import { bindBrowserWorkspace } from '@/storage/browserJournalRepository';
import { setWorkspaceScope, type WorkspaceScope } from '@/storage/workspace';

export type AuthSessionState = {
  status: 'loading' | 'guest' | 'signed-out' | 'signed-in' | 'error' | 'account-mismatch' | 'unconfigured';
  user: { id: string; email: string | null } | null;
  error: string | null;
  /** True only after explicit Skip or verified sign-in, never during onboarding. */
  entryChoiceMade: boolean;
};

let snapshot: AuthSessionState = { status: 'loading', user: null, error: null, entryChoiceMade: false };
const listeners = new Set<() => void>();
let started: Promise<void> | null = null;
let subscribed = false;
let selectedWorkspace: WorkspaceScope | null = null;
let signInRequested = false;
const ENTRY_MODE_KEY = 'echo.entry-mode.v1';
let revision = 0;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let verifiedToken: string | null = null;
let verifiedIdentity: { id: string; email: string | null; expiresAt: number } | null = null;
let bindingQueue: Promise<boolean> = Promise.resolve(false);

function publish(next: Omit<AuthSessionState, 'entryChoiceMade'> & { entryChoiceMade?: boolean }): void {
  snapshot = { ...next, entryChoiceMade: next.entryChoiceMade ?? next.status === 'signed-in' };
  listeners.forEach(listener => listener());
}

export function getAuthSession(): AuthSessionState { return snapshot; }
export function useAuthSession(): AuthSessionState {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, getAuthSession, getAuthSession);
}


export async function prepareAccountSignIn(): Promise<void> {
  signInRequested = true;
  if (selectedWorkspace === 'guest') await saveEntryMode('onboarding');
}
async function entryMode(): Promise<string | null> {
  return Platform.OS === 'web' ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(ENTRY_MODE_KEY)) : SecureStore.getItemAsync(ENTRY_MODE_KEY);
}
async function saveEntryMode(mode: 'guest' | 'account' | 'onboarding'): Promise<void> {
  if (Platform.OS === 'web') localStorage.setItem(ENTRY_MODE_KEY, mode);
  else await SecureStore.setItemAsync(ENTRY_MODE_KEY, mode);
}
async function settleJournal(): Promise<void> {
  const journal = await import('./journal');
  const session = await import('./session');
  const current = session.getSession();
  if (current.active && (current.text.trim() || current.audioPath)) {
    journal.saveDraft({ promptId: current.prompt.id, promptTextSnapshot: current.prompt.text, mode: current.mode, body: current.text, audioPath: current.audioPath, durationSeconds: current.mode === 'voice' ? current.audioSeconds : current.elapsedSeconds, moodBefore: current.mood });
  }
  session.endSession();
  const onboarding = await import('./onboardingSelections');
  await Promise.all([journal.flushJournalWrites(), onboarding.flushOnboardingPersistence()]);
}
async function selectWorkspace(scope: WorkspaceScope): Promise<void> {
  if (selectedWorkspace === scope) return;
  await settleJournal();
  const [journal, onboarding, repository, persistence] = await Promise.all([import('./journal'), import('./onboardingSelections'), import('@/storage/journalRepository'), import('@/storage/onboardingPersistence')]);
  setWorkspaceScope(scope);
  journal.configureJournalRepository(repository.createDefaultJournalRepository());
  onboarding.configureOnboardingPersistence(persistence.createDefaultOnboardingPersistence());
  selectedWorkspace = scope;
}
async function openGuest(entryChoiceMade: boolean): Promise<void> {
  await selectWorkspace('guest');
  const onboarding = await import('./onboardingSelections');
  await onboarding.restoreOnboardingState();
  publish({ status: 'guest', user: null, error: null, entryChoiceMade: entryChoiceMade && Boolean(onboarding.getOnboardingSelections().completedAt) });
}
export async function enterGuestMode(): Promise<void> {
  ++revision; clearExpiry(); signInRequested = false;
  if (snapshot.status !== 'guest') publish({ status: 'loading', user: null, error: null });
  try {
    await selectWorkspace('guest');
    const onboarding = await import('./onboardingSelections');
    await onboarding.restoreOnboardingState();
    await onboarding.flushOnboardingPersistence();
    await openGuest(true);
    await saveEntryMode(snapshot.entryChoiceMade ? 'guest' : 'onboarding');
  } catch {
    publish({ status: 'error', user: null, error: 'We could not open your local journal. Allow local storage and try again. Your existing entries have not been changed.' });
    throw new Error('GuestWorkspaceUnavailable');
  }
}

async function bindWorkspace(userId: string): Promise<boolean> {
  if (Platform.OS === 'web') return bindBrowserWorkspace(userId);
  const bind = async () => {
    const key = 'echo.workspace-owner.v1';
    const owner = await SecureStore.getItemAsync(key);
    if (owner) return owner === userId;
    await SecureStore.setItemAsync(key, userId);
    return true;
  };
  bindingQueue = bindingQueue.then(bind, bind);
  return bindingQueue;
}

function clearExpiry(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
}

async function acceptSession(session: Session | null): Promise<void> {
  const currentRevision = ++revision;
  clearExpiry();
  if (!session) {
    verifiedToken = null;
    verifiedIdentity = null;
    publish({ status: 'signed-out', user: null, error: null });
    return;
  }
  if (!supabase) return;
  // Never authorize from a cached user object or an editable metadata flag.
  // Verify the JWT signature and expiry before binding or opening local data.
  if (snapshot.user?.id !== session.user.id || snapshot.status !== 'signed-in') {
    publish({ status: 'loading', user: null, error: null });
  }
  try {
    let identity = verifiedToken === session.access_token ? verifiedIdentity : null;
    if (!identity || identity.expiresAt <= Date.now()) {
      const { data, error } = await supabase.auth.getClaims(session.access_token);
      if (error || !data?.claims?.sub || typeof data.claims.exp !== 'number') {
        if (error && (error.status === 401 || error.status === 403 || error.name === 'AuthInvalidJwtError')) {
          if (currentRevision === revision) publish({ status: 'signed-out', user: null, error: 'Your session has ended. Sign in to return to your journal.' });
          return;
        }
        throw new Error('SessionVerificationUnavailable');
      }
      identity = { id: data.claims.sub, email: typeof data.claims.email === 'string' ? data.claims.email : null, expiresAt: data.claims.exp * 1000 };
      if (identity.expiresAt <= Date.now()) {
        if (currentRevision === revision) publish({ status: 'signed-out', user: null, error: 'Your session has ended. Sign in to return to your journal.' });
        return;
      }
      verifiedToken = session.access_token;
      verifiedIdentity = identity;
    }
    if (currentRevision !== revision) return;
    const belongs = await bindWorkspace(identity.id);
    if (currentRevision !== revision) return;
    const user = { id: identity.id, email: identity.email };
    if (!belongs) {
      publish({ status: 'account-mismatch', user, error: 'This device holds a journal belonging to another account. Sign in with the original account to reopen it. Nothing has been changed.' });
      return;
    }
    const mode = await entryMode();
    if (selectedWorkspace === 'guest' || mode === 'onboarding' || mode === 'guest') {
      await settleJournal();
      const { transferGuestOnboarding } = await import('@/storage/guestAccountTransfer');
      await transferGuestOnboarding(identity.id);
    }
    await selectWorkspace('account');
    await saveEntryMode('account');
    if (currentRevision !== revision) return;
    signInRequested = false;
    publish({ status: 'signed-in', user, error: null });
    expiryTimer = setTimeout(() => { void retryAuthSession(); }, Math.min(2_147_483_647, Math.max(1, identity.expiresAt - Date.now())));
  } catch {
    if (currentRevision === revision) publish({ status: 'error', user: null, error: 'We could not verify your saved session or open its local storage. Check your connection and try again. Your journal has not been changed.' });
  }
}

async function restoreSession(): Promise<void> {
  let mode: string | null;
  try {
    mode = await entryMode();
    if (!signInRequested && (mode === 'guest' || mode === 'onboarding')) { await openGuest(mode === 'guest'); return; }
  } catch { publish({ status: 'error', user: null, error: 'Local storage could not be opened. Try again to restore your journal.' }); return; }
  if (!supabase) {
    try { await saveEntryMode('onboarding'); await openGuest(false); }
    catch { publish({ status: 'error', user: null, error: 'Local storage could not be opened. Try again to restore your journal.' }); }
    return;
  }
  const restoreRevision = revision;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (restoreRevision !== revision) return;
    if (error) throw error;
    if (!data.session && mode !== 'account' && !signInRequested) {
      await saveEntryMode('onboarding');
      await openGuest(false);
      return;
    }
    await acceptSession(data.session);
  } catch {
    if (restoreRevision !== revision) return;
    publish({ status: 'error', user: null, error: 'We could not restore your session. Check your connection and allow local storage, then try again.' });
  }
}

export function initializeAuthSession(): Promise<void> {
  if (!subscribed && supabase) {
    subscribed = true;
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (snapshot.status === 'guest' && !signInRequested) return;
      // This callback stays synchronous. Any SDK work starts outside its lock.
      if (event === 'SIGNED_OUT') {
        ++revision;
        clearExpiry();
        verifiedToken = null;
        verifiedIdentity = null;
        publish({ status: 'signed-out', user: null, error: null });
        return;
      }
      if (snapshot.user?.id !== session?.user.id) publish({ status: 'loading', user: null, error: null });
      const eventRevision = ++revision;
      setTimeout(() => { if (eventRevision === revision) void acceptSession(session); }, 0);
    });
  }
  started ??= restoreSession();
  return started;
}

export async function retryAuthSession(): Promise<void> {
  ++revision;
  publish({ status: 'loading', user: null, error: null });
  started = null;
  await initializeAuthSession();
}

export async function signOutAccount(): Promise<void> {
  await settleJournal();
  await saveEntryMode('account');
  await authService.signOut();
  ++revision;
  clearExpiry();
  verifiedToken = null;
  verifiedIdentity = null;
  publish({ status: 'signed-out', user: null, error: null });
}
