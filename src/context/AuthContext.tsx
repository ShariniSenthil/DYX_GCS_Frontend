/**
 * Persistent authentication context for the DYX 4WD Rover Backend.
 *
 * Login contract:
 * - A successful login is stored in AsyncStorage.
 * - App closure must not remove the session.
 * - Tablet restart must not remove the session.
 * - Wi-Fi loss must not remove the session.
 * - Jetson restart must not remove the session.
 * - HTTP 401 must not automatically erase the local session.
 * - Explicit Logout removes the session.
 * - A confirmed auth_revoked security event may remove the session.
 */

import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  AuthError,
  AuthRevokedEvent,
  AuthSession,
  ChangePasswordRequest,
  ChangePasswordResponse,
  LoginRequest,
  LoginResponse,
} from "../types/auth";

import {
  clearSession,
  loadSession,
  saveSession,
} from "../services/authStorage";

import { apiPost, configureApiClient } from "../services/apiClient";

import {
  configure as configureSocket,
  on as socketOn,
} from "../services/socketClient";

import { PX4_AUTH } from "../config/px4Endpoints";
import { AUTH_ENABLED } from "../config/featureFlags";

// ── Context type ──────────────────────────────────────────────────────────────

export interface AuthContextValue {
  /**
   * True when a locally stored login session exists.
   *
   * Connectivity problems do not change this value.
   */
  isAuthenticated: boolean;

  /** Current persisted operator session. */
  session: AuthSession | null;

  /** True while AsyncStorage is being checked during app startup. */
  isLoading: boolean;

  /**
   * Retained for UI compatibility.
   * Persistent sessions do not display automatic expiry warnings.
   */
  isExpiringSoon: boolean;

  /** Most recent authentication-related error. */
  lastError: AuthError | null;

  /** Login using the static backend username and password. */
  login: (username: string, password: string) => Promise<void>;

  /** Explicitly end the current operator session. */
  logout: () => Promise<void>;

  /** Retained for future password-change support. */
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({
  children,
}: AuthProviderProps): React.ReactElement {
  const [session, setSession] = useState<AuthSession | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [lastError, setLastError] = useState<AuthError | null>(null);

  /**
   * Clear the local session.
   *
   * This is used only for:
   * - Explicit Logout
   * - Confirmed auth_revoked security event
   */
  const clearLocalSession = useCallback(async (): Promise<void> => {
    setSession(null);
    setLastError(null);

    await clearSession();
  }, []);

  // ── REST token injection ──────────────────────────────────────────────────

  useEffect(() => {
    configureApiClient(
      () => session?.token ?? null,

      /**
       * Do not automatically log out on HTTP 401.
       *
       * A temporary backend restart, delayed service startup or connection
       * issue must not delete the locally saved operator login.
       */
      () => {
        console.warn(
          "[AuthContext] Authenticated request returned 401. " +
            "The stored login session has been retained.",
        );

        setLastError({
          code: "session_unavailable",
          message:
            "The rover could not verify the saved session. " +
            "The app will keep the login and retry after reconnection.",
        });
      },
    );
  }, [session]);

  // ── Socket token injection ────────────────────────────────────────────────

  useEffect(() => {
    configureSocket(() => session?.token ?? null);
  }, [session]);

  // ── Restore saved login on application startup ────────────────────────────

  useEffect(() => {
    let mounted = true;

    const restoreSavedSession = async (): Promise<void> => {
      if (!AUTH_ENABLED) {
        if (mounted) {
          setIsLoading(false);
        }

        return;
      }

      try {
        const savedSession = await loadSession();

        if (mounted && savedSession) {
          setSession(savedSession);
          setLastError(null);

          console.log("[AuthContext] Restored saved operator session.");
        }
      } catch (error) {
        console.warn("[AuthContext] Could not restore saved session:", error);

        /*
         * Do not clear AsyncStorage here.
         * A temporary storage/read issue must not intentionally log out
         * the operator.
         */
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void restoreSavedSession();

    return () => {
      mounted = false;
    };
  }, []);

  // ── Confirmed security revocation ─────────────────────────────────────────

  useEffect(() => {
    if (!AUTH_ENABLED) {
      return;
    }

    const unsubscribe = socketOn(
      "auth_revoked",

      (event: unknown) => {
        const revokedEvent = event as AuthRevokedEvent;

        console.warn(
          "[AuthContext] Backend revoked the session:",
          revokedEvent.reason,
        );

        void clearLocalSession();
      },

      "auth-context-revoked",
    );

    return unsubscribe;
  }, [clearLocalSession]);

  // ── Login ─────────────────────────────────────────────────────────────────

  const login = useCallback(
    async (username: string, password: string): Promise<void> => {
      setLastError(null);

      if (!AUTH_ENABLED) {
        return;
      }

      const trimmedUsername = username.trim();

      if (!trimmedUsername) {
        const error: AuthError = {
          code: "invalid_password",
          message: "Username is required.",
        };

        setLastError(error);
        throw new Error(error.message);
      }

      if (!password) {
        const error: AuthError = {
          code: "invalid_password",
          message: "Password is required.",
        };

        setLastError(error);
        throw new Error(error.message);
      }

      try {
        const request: LoginRequest = {
          username: trimmedUsername,
          password,
        };

        const response = await apiPost<LoginResponse>(PX4_AUTH.LOGIN, request, {
          skipAuth: true,
          timeoutMs: 15_000,
        });

        if (response.success === false) {
          throw new Error("Backend rejected the login request.");
        }

        const savedSession = await saveSession(response);

        setSession(savedSession);
        setLastError(null);

        console.log("[AuthContext] Operator login saved successfully.");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Login failed.";

        const normalizedMessage = message.toLowerCase();

        const invalidCredentials =
          normalizedMessage.includes("401") ||
          normalizedMessage.includes("invalid") ||
          normalizedMessage.includes("unauthorized");

        const authError: AuthError = {
          code: invalidCredentials ? "invalid_password" : "network_error",

          message: invalidCredentials
            ? "Invalid username or password."
            : message,
        };

        setLastError(authError);

        throw new Error(authError.message);
      }
    },
    [],
  );

  // ── Logout ────────────────────────────────────────────────────────────────

  const logout = useCallback(async (): Promise<void> => {
    if (!AUTH_ENABLED) {
      return;
    }

    try {
      if (session?.token) {
        /*
         * Best-effort backend logout.
         *
         * Even when Wi-Fi is unavailable, pressing Logout must remove the
         * locally persisted session.
         */
        await apiPost(PX4_AUTH.LOGOUT, undefined, {
          timeoutMs: 8_000,
        }).catch((error) => {
          console.warn(
            "[AuthContext] Backend logout request failed. " +
              "Local logout will continue:",
            error,
          );
        });
      }
    } finally {
      await clearLocalSession();

      console.log("[AuthContext] Operator logged out explicitly.");
    }
  }, [session, clearLocalSession]);

  // ── Password change compatibility ─────────────────────────────────────────

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      if (!AUTH_ENABLED) {
        return;
      }

      setLastError(null);

      try {
        const request: ChangePasswordRequest = {
          current_password: currentPassword,

          new_password: newPassword,
        };

        const response = await apiPost<ChangePasswordResponse>(
          PX4_AUTH.CHANGE_PASSWORD,
          request,
        );

        /*
         * Normalize the password-change response so it can use the same
         * persistent storage function as login.
         */
        const normalizedResponse: LoginResponse = {
          success: true,

          token: response.token,

          token_type: "X-Rover-Token",

          expires_at: response.expires_at,

          session_id: response.session_id,

          user: {
            username: session?.username ?? "admin",
          },

          rover: {
            id: session?.roverId ?? "dyx-4wd-001",

            name: session?.roverName ?? "DYX 4WD Rover",
          },
        };

        const savedSession = await saveSession(normalizedResponse);

        setSession(savedSession);
        setLastError(null);
      } catch (error) {
        const authError: AuthError = {
          code: "unknown",

          message:
            error instanceof Error ? error.message : "Password change failed.",
        };

        setLastError(authError);

        throw new Error(authError.message);
      }
    },
    [session],
  );

  // ── Context value ─────────────────────────────────────────────────────────

  /**
   * Persistent-login contract:
   *
   * Authentication depends only on whether a locally stored session exists.
   * We deliberately do not compare Date.now() against expiresAt here.
   */
  const isAuthenticated = !AUTH_ENABLED || session !== null;

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      session,
      isLoading,

      // Persistent sessions do not show expiry warnings.
      isExpiringSoon: false,

      lastError,
      login,
      logout,
      changePassword,
    }),

    [
      isAuthenticated,
      session,
      isLoading,
      lastError,
      login,
      logout,
      changePassword,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}

export default AuthContext;
