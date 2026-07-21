/**
 * AuthContext — Operator session state for 4WD_SERVER.
 *
 * Responsibilities:
 * - Loads persisted session on mount (token + expiry)
 * - Provides login/logout/changePassword actions
 * - Injects token into apiClient and socketClient on auth
 * - Handles `auth_revoked` socket event → force logout
 * - Shows expiry warning banner at T-5min
 *
 * Provider tree placement: wrap the entire app root (above RoverProvider).
 *
 * When ROVER_ENABLED=false, context is mounted but auth is skipped —
 * isAuthenticated is always true and login/logout are no-ops.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import type {
  AuthSession,
  AuthError,
  AuthRevokedEvent,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
} from '../types/auth';
import {
  saveSession,
  loadSession,
  clearSession,
  isExpiringSoon,
} from '../services/authStorage';
import { configureApiClient, apiPost } from '../services/apiClient';
import { configure as configureSocket, on as socketOn } from '../services/socketClient';
import { PX4_AUTH } from '../config/px4Endpoints';
import { AUTH_ENABLED } from '../config/featureFlags';

// ── Context value ─────────────────────────────────────────────────────────────

export interface AuthContextValue {
  /** True when a valid, non-expired session is held (or auth is disabled). */
  isAuthenticated: boolean;
  /** Current session — null if not authenticated. */
  session: AuthSession | null;
  /** True while the initial session load from storage is in progress. */
  isLoading: boolean;
  /** Set when a warning should be shown (session expiring soon). */
  isExpiringSoon: boolean;
  /** Last auth error. */
  lastError: AuthError | null;
  /** Login with operator username and password. */
login: (
  username: string,
  password: string,
) => Promise<void>;
  /** Logout current session. */
  logout: () => Promise<void>;
  /** Change password; refreshes token on success. */
  changePassword: (current: string, next: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [lastError, setLastError] = useState<AuthError | null>(null);

  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Token getter for apiClient / socketClient ─────────────────────────────
  const getToken = useCallback((): string | null => session?.token ?? null, [session]);

  // Configure apiClient once (callback-based injection avoids circular imports)
  useEffect(() => {
    configureApiClient(
      () => session?.token ?? null,
      () => {
        // 401 received — force logout
        console.warn('[AuthContext] 401 received — forcing logout');
        void _clearSessionState();
      },
    );
  }, [session]);

  // Configure socketClient token getter
  useEffect(() => {
    configureSocket(() => session?.token ?? null);
  }, [session]);

  // ── Expiry warning timer ──────────────────────────────────────────────────
  const scheduleExpiryWarning = useCallback((s: AuthSession) => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    const warningMs = s.expiresAt - Date.now() - 5 * 60 * 1000; // 5 min before expiry
    if (warningMs > 0) {
      expiryTimerRef.current = setTimeout(() => setExpiringSoon(true), warningMs);
    } else {
      setExpiringSoon(true);
    }
  }, []);

 
// ── App launch: restore the saved login session ─────────────────────────────
useEffect(() => {
  if (!AUTH_ENABLED) {
    setIsLoading(false);
    return;
  }

  const restoreSavedSession = async () => {
    try {
      const savedSession = await loadSession();

      if (savedSession) {
        setSession(savedSession);

        setExpiringSoon(
          isExpiringSoon(savedSession),
        );

        scheduleExpiryWarning(savedSession);
      }
    } catch (error) {
      console.warn(
        '[AuthContext] Failed to restore saved session:',
        error,
      );
    } finally {
      setIsLoading(false);
    }
  };

  void restoreSavedSession();

  return () => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
    }
  };
}, [scheduleExpiryWarning]);

  // ── auth_revoked socket listener ─────────────────────────────────────────
  useEffect(() => {
    if (!AUTH_ENABLED) return;

    const off = socketOn(
      'auth_revoked',
      (event: unknown) => {
        const e = event as AuthRevokedEvent;
        console.warn('[AuthContext] auth_revoked received:', e.reason);
        void _clearSessionState();
      },
      'auth-context-revoked',
    );

    return off;
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const _clearSessionState = async () => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    setSession(null);
    setExpiringSoon(false);
    await clearSession();
  };

const login = useCallback(
  async (
    username: string,
    password: string,
  ): Promise<void> => {
    setLastError(null);

    try {
      if (!AUTH_ENABLED) {
        return;
      }

      const request: LoginRequest = {
        username: username.trim(),
        password,
      };

      const raw = await apiPost<LoginResponse>(
        PX4_AUTH.LOGIN,
        request,
        {
          skipAuth: true,
        },
      );

      const newSession = await saveSession(raw);

      setSession(newSession);
      setExpiringSoon(false);

      scheduleExpiryWarning(newSession);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Login failed';

      const invalidCredentials =
        errorMessage.includes('401') ||
        errorMessage
          .toLowerCase()
          .includes('invalid');

      const authError: AuthError = {
        code: invalidCredentials
          ? 'invalid_password'
          : 'network_error',

        message: invalidCredentials
          ? 'Invalid username or password.'
          : errorMessage,
      };

      setLastError(authError);

      throw new Error(authError.message);
    }
  },
  [scheduleExpiryWarning],
);

  const logout = useCallback(async (): Promise<void> => {
    if (!AUTH_ENABLED) return;
    try {
      if (session?.token) {
        await apiPost(PX4_AUTH.LOGOUT, undefined).catch(() => {
          // Best-effort: clear locally even if server fails
        });
      }
    } finally {
      await _clearSessionState();
    }
  }, [session]);

  const changePassword = useCallback(
    async (current: string, next: string): Promise<void> => {
      if (!AUTH_ENABLED) return;
      setLastError(null);
      try {
        const raw = await apiPost<{
          token: string;
          session_id: string;
          expires_at: string;
          ttl_s: number;
          revoked_sessions: number;
        }>(PX4_AUTH.CHANGE_PASSWORD, {
          current_password: current,
          new_password: next,
        } satisfies ChangePasswordRequest);

        const newSession = await saveSession(raw);
        setSession(newSession);
        setExpiringSoon(false);
        scheduleExpiryWarning(newSession);
      } catch (err) {
        const authErr: AuthError = {
          code: 'unknown',
          message: err instanceof Error ? err.message : 'Password change failed',
        };
        setLastError(authErr);
        throw authErr;
      }
    },
    [scheduleExpiryWarning],
  );

  // ── Context value ─────────────────────────────────────────────────────────

  const isAuthenticated = !AUTH_ENABLED || (session !== null && Date.now() < session.expiresAt);

  const contextValue = React.useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      session,
      isLoading,
      isExpiringSoon: expiringSoon,
      lastError,
      login,
      logout,
      changePassword,
    }),
    [isAuthenticated, session, isLoading, expiringSoon, lastError, login, logout, changePassword],
  );

  return React.createElement(AuthContext.Provider, { value: contextValue }, children);
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Access auth state and actions. Must be used within <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
