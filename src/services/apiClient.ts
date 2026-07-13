/**
 * apiClient — Central authenticated REST transport layer.
 *
 * Features:
 * - Injects X-Rover-Token on all protected calls
 * - Resolves base URL from getBackendURL() at call time (dynamic URL)
 * - Maps HTTP error codes to typed ApiError subclasses
 * - Triggers onUnauthorized callback (→ logout) on 401
 * - skipAuth: true for public routes (login, ping, healthz)
 *
 * Usage:
 *   import { apiPost } from './apiClient';
 *   const result = await apiPost<MissionStartResponse>(PX4_MISSION.START);
 */

import { getBackendURL } from '../config';
import {
  ApiError,
  NetworkError,
  UnauthorizedError,
  classifyHttpError,
} from './apiError';

// ── Token provider injection ──────────────────────────────────────────────────

/** Callback signature to obtain the current auth token. */
type GetTokenFn = () => string | null;

/** Called when any response returns 401. Implement to trigger logout. */
type OnUnauthorizedFn = () => void;

let _getToken: GetTokenFn = () => null;
let _onUnauthorized: OnUnauthorizedFn = () => {};

/**
 * Configure token injection. Call once at app startup from AuthContext.
 * This breaks the circular dependency: apiClient doesn't import AuthContext.
 */
export function configureApiClient(
  getToken: GetTokenFn,
  onUnauthorized: OnUnauthorizedFn,
): void {
  _getToken = getToken;
  _onUnauthorized = onUnauthorized;
}

// ── Request options ───────────────────────────────────────────────────────────

export interface ApiRequestOptions {
  /**
   * Skip injecting X-Rover-Token header.
   * Use for: /api/ping, /api/healthz, /api/auth/login.
   */
  skipAuth?: boolean;
  /** Additional headers merged on top of defaults. */
  headers?: Record<string, string>;
  /** Fetch timeout in milliseconds. Default: 15 000. */
  timeoutMs?: number;
}

// ── Internal fetch ────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: ApiRequestOptions = {},
): Promise<T> {
  const base = getBackendURL().replace(/\/$/, '');
  const url = `${base}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers ?? {}),
  };

  if (!opts.skipAuth) {
    const token = _getToken();
    if (token) {
      headers['X-Rover-Token'] = token;
    }
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new NetworkError(new Error(`Request timed out after ${timeoutMs}ms: ${path}`));
    }
    throw new NetworkError(err);
  } finally {
    clearTimeout(timeoutId);
  }

  const rawBody = await response.text().catch(() => '');

  if (!response.ok) {
    const apiErr = classifyHttpError(response.status, rawBody, path);
    if (apiErr instanceof UnauthorizedError) {
      _onUnauthorized();
    }
    throw apiErr;
  }

  if (!rawBody) {
    return undefined as unknown as T;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    // Non-JSON success response — return raw string cast
    return rawBody as unknown as T;
  }
}

// ── Public helpers ────────────────────────────────────────────────────────────

/** GET request. Returns parsed JSON body. */
export async function apiGet<T>(
  path: string,
  opts?: ApiRequestOptions,
): Promise<T> {
  return request<T>('GET', path, undefined, opts);
}

/** POST request with optional JSON body. */
export async function apiPost<T>(
  path: string,
  body?: unknown,
  opts?: ApiRequestOptions,
): Promise<T> {
  return request<T>('POST', path, body, opts);
}

/** PUT request with optional JSON body. */
export async function apiPut<T>(
  path: string,
  body?: unknown,
  opts?: ApiRequestOptions,
): Promise<T> {
  return request<T>('PUT', path, body, opts);
}

/** DELETE request. */
export async function apiDelete<T>(
  path: string,
  opts?: ApiRequestOptions,
): Promise<T> {
  return request<T>('DELETE', path, undefined, opts);
}

export const apiClient = { apiGet, apiPost, apiPut, apiDelete, configureApiClient };
export default apiClient;
