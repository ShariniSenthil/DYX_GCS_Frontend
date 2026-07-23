/**
 * Persistent authentication storage for the DYX 4WD Rover Backend.
 *
 * Required behaviour:
 * - Keep the operator logged in after app closure.
 * - Keep the operator logged in after tablet restart.
 * - Keep the operator logged in during Wi-Fi or Jetson disconnection.
 * - Remove the session only after explicit Logout or security revocation.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  AuthSession,
  LoginResponse,
} from "../types/auth";

const SESSION_KEY = "@rover_auth_session";

/**
 * Convert backend expires_at into epoch milliseconds.
 *
 * The current backend uses a long-lived session. Expiration is stored only
 * as session information; the frontend does not automatically delete it.
 */
function parseExpiresAtMs(
  expiresAt: string | number | undefined,
): number {
  if (typeof expiresAt === "number") {
    return expiresAt < 1_000_000_000_000
      ? expiresAt * 1000
      : expiresAt;
  }

  if (typeof expiresAt === "string") {
    const parsed = Date.parse(expiresAt);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  // Compatibility fallback only. The backend normally always returns expires_at.
  return Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
}

/**
 * Save the result returned from POST /api/auth/login.
 */
export async function saveSession(
  response: LoginResponse,
): Promise<AuthSession> {
  if (!response.token) {
    throw new Error("Login response did not contain a token.");
  }

  if (!response.session_id) {
    throw new Error(
      "Login response did not contain a session ID.",
    );
  }

  const expiresAt = parseExpiresAtMs(
    response.expires_at,
  );

  const session: AuthSession = {
    token: response.token,
    sessionId: response.session_id,

    username:
      response.user?.username ??
      response.username,

    roverId:
      response.rover?.id ??
      response.rover_id,

    roverName:
      response.rover?.name,

    expiresAt,

    ttlS:
      response.ttl_s ??
      Math.max(
        0,
        Math.floor(
          (expiresAt - Date.now()) / 1000,
        ),
      ),
  };

  await AsyncStorage.setItem(
    SESSION_KEY,
    JSON.stringify(session),
  );

  return session;
}

/**
 * Load the previously saved session.
 *
 * Important:
 * This function does not remove the session because of time, Wi-Fi loss,
 * backend restart or temporary connection failure.
 */
export async function loadSession(): Promise<AuthSession | null> {
  try {
    const storedValue =
      await AsyncStorage.getItem(SESSION_KEY);

    if (!storedValue) {
      return null;
    }

    const parsed = JSON.parse(
      storedValue,
    ) as Partial<AuthSession> & {
      session_id?: string;
      expires_at?: string | number;
      rover_id?: string;
      rover_name?: string;
    };

    const token = parsed.token;
    const sessionId =
      parsed.sessionId ??
      parsed.session_id;

    if (
      typeof token !== "string" ||
      token.trim().length === 0 ||
      typeof sessionId !== "string" ||
      sessionId.trim().length === 0
    ) {
      await clearSession();
      return null;
    }

    // Supports migration from any previously stored session shape.
    const session: AuthSession = {
      token,
      sessionId,

      username: parsed.username,

      roverId:
        parsed.roverId ??
        parsed.rover_id,

      roverName:
        parsed.roverName ??
        parsed.rover_name,

      expiresAt: parseExpiresAtMs(
        parsed.expiresAt ??
        parsed.expires_at,
      ),

      ttlS: parsed.ttlS,
    };

    // Save the normalized structure after migration.
    await AsyncStorage.setItem(
      SESSION_KEY,
      JSON.stringify(session),
    );

    return session;
  } catch (error) {
    console.warn(
      "[authStorage] Could not load stored session:",
      error,
    );

    return null;
  }
}

/**
 * Remove the locally stored login.
 *
 * This must only be called for:
 * - Explicit operator Logout
 * - Confirmed backend security revocation
 * - Invalid/corrupted local session data
 */
export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(
      SESSION_KEY,
    );
  } catch (error) {
    console.warn(
      "[authStorage] Could not clear stored session:",
      error,
    );
  }
}

/**
 * Check whether login information exists locally.
 *
 * Backend connectivity is deliberately not checked here.
 */
export async function hasValidSession(): Promise<boolean> {
  const session = await loadSession();

  return Boolean(
    session?.token &&
    session?.sessionId,
  );
}

/**
 * Persistent-login mode does not show an automatic expiry warning.
 *
 * The backend session is configured as long-lived and remains active until
 * explicit logout under the current product contract.
 */
export function isExpiringSoon(
  _session: AuthSession,
  _thresholdMs = 5 * 60 * 1000,
): boolean {
  return false;
}