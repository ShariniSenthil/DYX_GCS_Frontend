/**
 * Authentication types — 4WD_SERVER operator session model.
 *
 * Backend: 4WD_SERVER/server/routes/auth.py
 * Contract: password-only login, single operator role, machine-token read-only scopes.
 */

// ── Session model ─────────────────────────────────────────────────────────────

/** Persisted in AsyncStorage after successful login. */
export interface AuthSession {
  /** Bearer token — injected as X-Rover-Token header on all protected REST calls.
   *  Also passed as `auth: { token }` on Socket.IO connect. */
  token: string;
  /** Server-assigned session identifier. */
  sessionId: string;
  /** Unix epoch milliseconds — token expiry time. */
  expiresAt: number;
  /** Server-reported TTL in seconds (informational). */
  ttlS: number;
}

// ── Request / Response shapes ─────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  session_id: string;
  /** ISO-8601 UTC string from 4WD_SERVER (e.g. "2026-06-30T12:00:00Z") */
  expires_at: string;
  ttl_s: number;
  username?: string;
  rover_id?: string;
}

export interface LogoutResponse {
    success: boolean;
    message: string;

}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  token: string;
  session_id: string;
  expires_at: string;
  ttl_s: number;
  revoked_sessions: number;
}

// ── Error types ───────────────────────────────────────────────────────────────

export type AuthErrorCode =
  | 'invalid_password'
  | 'session_expired'
  | 'session_revoked'
  | 'network_error'
  | 'unknown';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

// ── Socket.IO events ──────────────────────────────────────────────────────────

/** Emitted by server when operator changes password — all other sessions revoked. */
export interface AuthRevokedEvent {
  reason: 'password_changed' | string;
  session_id?: string;
}
