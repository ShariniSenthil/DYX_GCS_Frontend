/**
 * Authentication types for the DYX 4WD Rover Backend.
 *
 * Backend endpoints:
 * POST /api/auth/login
 * GET  /api/auth/session
 * POST /api/auth/logout
 */

// ── Stored session ────────────────────────────────────────────────────────────

/**
 * Persisted in AsyncStorage.
 *
 * The frontend keeps this session until the operator explicitly presses Logout.
 * Temporary Wi-Fi loss, app closure or Jetson restart must not remove it.
 */
export interface AuthSession {
  /** Injected as X-Rover-Token on authenticated requests. */
  token: string;

  /** Backend-generated session identifier. */
  sessionId: string;

  /** Login details returned by the backend. */
  username?: string;

  /** Rover identity returned by the backend. */
  roverId?: string;
  roverName?: string;

  /**
   * Backend expiration converted to epoch milliseconds.
   * Stored for information only; frontend login is not cleared automatically.
   */
  expiresAt: number;

  /** Optional compatibility value calculated from expiresAt. */
  ttlS?: number;
}

// ── Login ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Exact response from:
 * POST /api/auth/login
 */
export interface LoginResponse {
  success: boolean;

  token: string;
  token_type: string;
  expires_at: string;
  session_id: string;

  user: {
    username: string;
  };

  rover: {
    id: string;
    name: string;
  };

  /*
   * Optional compatibility fields for any older backend response.
   * These can be removed after the frontend migration is complete.
   */
  ttl_s?: number;
  username?: string;
  rover_id?: string;
}

// ── Session verification ──────────────────────────────────────────────────────

/**
 * Exact response from:
 * GET /api/auth/session
 */
export interface SessionResponse {
  authenticated: boolean;

  session: {
    session_id: string;
    username: string;
    created_at: string;
    expires_at: string;
  };

  rover: {
    id: string;
    name: string;
  };
}

// ── Logout ────────────────────────────────────────────────────────────────────

export interface LogoutResponse {
  success: boolean;
  message: string;
}

// ── Future password-change support ────────────────────────────────────────────

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  token: string;
  session_id: string;
  expires_at: string;
  revoked_sessions: number;
}

// ── Authentication errors ─────────────────────────────────────────────────────

export type AuthErrorCode =
  | "invalid_password"
  | "session_unavailable"
  | "session_revoked"
  | "network_error"
  | "unknown";

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

// ── Socket.IO authentication events ───────────────────────────────────────────

export interface AuthRevokedEvent {
  reason: string;
  session_id?: string;
}