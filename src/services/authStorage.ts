/**
 * Auth Storage — persists operator session in AsyncStorage.
 *
 * Key: @rover_auth_session
 * Format: JSON-serialized AuthSession.
 *
 * Security note: AsyncStorage is not hardware-backed. Phase 1 uses it for
 * simplicity. A future hardening pass should migrate to expo-secure-store.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthSession } from '../types/auth';
import type { LoginResponse } from '../types/auth';

const SESSION_KEY = '@rover_auth_session';

/** 4WD_SERVER returns expires_at as ISO-8601 UTC, not epoch seconds. */
function parseExpiresAtMs(expiresAt: string | number): number {
  if (typeof expiresAt === 'number') {
    return expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  }
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid expires_at from server: ${expiresAt}`);
  }
  return ms;
}

/**
 * Persist a session received from POST /api/auth/login.
 * Converts backend `expires_at` (ISO string) → `expiresAt` (epoch ms).
 */
export async function saveSession(raw: LoginResponse): Promise<AuthSession> {
  const session: AuthSession = {
    token: raw.token,
    sessionId: raw.session_id,
    expiresAt: parseExpiresAtMs(raw.expires_at),
    ttlS: raw.ttl_s,
  };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

/**
 * Load persisted session from storage.
 * Returns null if no session found, JSON parse fails, or token is expired.
 */
export async function loadSession(): Promise<AuthSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session: AuthSession = JSON.parse(raw);

    // Validate shape
    if (!session.token || !session.sessionId || !session.expiresAt) {
      await clearSession();
      return null;
    }

    // Check expiry
    if (Date.now() >= session.expiresAt) {
      await clearSession();
      return null;
    }

    return session;
  } catch {
    // Corrupted storage — clear and return null
    await clearSession().catch(() => {});
    return null;
  }
}

/**
 * Remove persisted session. Call on logout or auth_revoked.
 */
export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // Best-effort
  }
}

/**
 * Check whether a stored, non-expired session exists.
 * Does not load the full token — use loadSession() for that.
 */
export async function hasValidSession(): Promise<boolean> {
  const session = await loadSession();
  return session !== null;
}

/**
 * Return true if the session will expire within `thresholdMs` milliseconds.
 * Useful for showing a "session expiring soon" warning.
 */
export function isExpiringSoon(session: AuthSession, thresholdMs = 5 * 60 * 1000): boolean {
  return Date.now() >= session.expiresAt - thresholdMs;
}
