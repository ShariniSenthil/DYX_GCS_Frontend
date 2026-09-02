/**
 * Central authenticated REST transport for the DYX 4WD Rover Backend.
 *
 * Supports:
 * - Authenticated JSON requests
 * - Authenticated multipart file uploads
 * - Dynamic rover backend URL
 * - Request timeouts
 * - Central HTTP error handling
 */

import {
  getBackendURL,
} from "../config";

import {
  NetworkError,
  UnauthorizedError,
  classifyHttpError,
} from "./apiError";

// ── Authentication configuration ─────────────────────────────────────────────

type GetTokenFn =
  () => string | null;

type OnUnauthorizedFn =
  () => void;

let getToken: GetTokenFn =
  () => null;

let onUnauthorized: OnUnauthorizedFn =
  () => {};

export function configureApiClient(
  tokenProvider: GetTokenFn,
  unauthorizedHandler: OnUnauthorizedFn,
): void {
  getToken =
    tokenProvider;

  onUnauthorized =
    unauthorizedHandler;
}

// ── Request options ───────────────────────────────────────────────────────────

export interface ApiRequestOptions {
  /**
   * Public endpoints such as login, ping and health checks do not require
   * X-Rover-Token.
   */
  skipAuth?: boolean;

  /**
   * Additional request headers.
   */
  headers?: Record<string, string>;

  /**
   * Request timeout in milliseconds.
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS =
  15_000;

const DEFAULT_UPLOAD_TIMEOUT_MS =
  60_000;

// ── Request helpers ───────────────────────────────────────────────────────────

function isMultipartFormData(
  body: unknown,
): body is FormData {
  return (
    typeof FormData !== "undefined" &&
    body instanceof FormData
  );
}

function createHeaders(
  body: unknown,
  options: ApiRequestOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  if (isMultipartFormData(body)) {
    /*
     * Do not manually set Content-Type for FormData.
     *
     * React Native fetch automatically generates:
     * multipart/form-data; boundary=...
     */
    delete headers["Content-Type"];
    delete headers["content-type"];
  } else {
    const hasContentType =
      Boolean(
        headers["Content-Type"] ??
        headers["content-type"],
      );

    if (!hasContentType) {
      headers["Content-Type"] =
        "application/json";
    }
  }

  if (!options.skipAuth) {
    const token =
      getToken();

    if (token) {
      headers["X-Rover-Token"] =
        token;
    }
  }

  return headers;
}

function createRequestBody(
  body: unknown,
): FormData | string | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (isMultipartFormData(body)) {
    return body;
  }

  return JSON.stringify(body);
}

// ── Retry helpers ─────────────────────────────────────────────────────────────

/**
 * Methods that mutate server state must NOT be retried automatically —
 * a double-send of a "start mission" or "arm" command would be dangerous.
 * Only safe idempotent reads (GET, DELETE) are retried.
 */
const RETRYABLE_METHODS = new Set(["GET", "DELETE"]);

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;

function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Internal request function ─────────────────────────────────────────────────

async function requestOnce<T>(
  method: string,
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  const backendURL =
    getBackendURL()
      .replace(/\/+$/, "");

  const normalizedPath =
    path.startsWith("/")
      ? path
      : `/${path}`;

  const url =
    `${backendURL}${normalizedPath}`;

  const controller =
    new AbortController();

  const timeoutMs =
    options.timeoutMs ??
    DEFAULT_TIMEOUT_MS;

  const timeoutId =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        url,
        {
          method,
          headers:
            createHeaders(
              body,
              options,
            ),
          body:
            createRequestBody(
              body,
            ),
          signal:
            controller.signal,
        },
      );

    const rawResponseBody =
      await response
        .text()
        .catch(
          () => "",
        );

    if (!response.ok) {
      const apiError =
        classifyHttpError(
          response.status,
          rawResponseBody,
          normalizedPath,
        );

      if (
        apiError instanceof UnauthorizedError &&
        !options.skipAuth
      ) {
        /*
         * AuthContext decides whether the session should actually be cleared.
         * Temporary Wi-Fi or Jetson availability problems must not log out
         * the operator automatically.
         */
        onUnauthorized();
      }

      throw apiError;
    }

    if (!rawResponseBody) {
      return undefined as T;
    }

    try {
      return JSON.parse(
        rawResponseBody,
      ) as T;
    } catch {
      return rawResponseBody as T;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new NetworkError(
        new Error(
          `Request timed out after ${timeoutMs} ms: ${normalizedPath}`,
        ),
      );
    }

    /*
     * Preserve errors already created by classifyHttpError.
     */
    if (
      error instanceof Error &&
      (
        "status" in error ||
        error instanceof UnauthorizedError ||
        error instanceof NetworkError
      )
    ) {
      throw error;
    }

    // React Native often collapses DNS, refused connections and clear-text
    // policy failures into the unhelpful "Network request failed" message.
    // Keep the original cause while adding the endpoint so operators can
    // immediately verify Wi-Fi, rover IP and port.
    const cause = error instanceof Error ? error.message : String(error);
    throw new NetworkError(
      new Error(`Unable to reach backend at ${backendURL}. Verify the rover is powered on, both devices are on the same Wi‑Fi, and port 5001 is open. (${cause || "network request failed"})`),
    );
  } finally {
    clearTimeout(
      timeoutId,
    );
  }
}

/**
 * Public request function with automatic retry for transient network errors.
 *
 * Only idempotent methods (GET, DELETE) are retried to prevent dangerous
 * duplicate mutations (e.g., double-sending an "arm" or "start mission" command).
 *
 * Retry schedule (exponential backoff):
 *   Attempt 1: immediate
 *   Attempt 2: 300ms delay
 *   Attempt 3: 600ms delay
 *   Attempt 4: 1200ms delay → throws to caller
 */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  const canRetry = RETRYABLE_METHODS.has(method.toUpperCase());

  let lastError: unknown;
  const attempts = canRetry ? MAX_RETRIES + 1 : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[apiClient] Retrying ${method} ${path} (attempt ${attempt + 1}/${attempts}) after ${delayMs}ms`,
      );
      await sleep(delayMs);
    }

    try {
      return await requestOnce<T>(method, path, body, options);
    } catch (error) {
      lastError = error;

      // Only retry on transient network errors, not on HTTP 4xx/5xx responses
      if (!isRetryableError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

// ── JSON request functions ────────────────────────────────────────────────────


export async function apiGet<T>(
  path: string,
  options?: ApiRequestOptions,
): Promise<T> {
  return request<T>(
    "GET",
    path,
    undefined,
    options,
  );
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  return request<T>(
    "POST",
    path,
    body,
    options,
  );
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  return request<T>(
    "PUT",
    path,
    body,
    options,
  );
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  return request<T>(
    "PATCH",
    path,
    body,
    options,
  );
}

export async function apiDelete<T>(
  path: string,
  options?: ApiRequestOptions,
): Promise<T> {
  return request<T>(
    "DELETE",
    path,
    undefined,
    options,
  );
}

// ── Multipart upload ──────────────────────────────────────────────────────────

/**
 * Upload multipart FormData with the saved X-Rover-Token.
 *
 * Never manually set the multipart Content-Type header. React Native creates
 * the correct boundary automatically.
 */
export async function apiPostMultipart<T>(
  path: string,
  formData: FormData,
  options?: ApiRequestOptions,
): Promise<T> {
  return request<T>(
    "POST",
    path,
    formData,
    {
      ...options,
      timeoutMs:
        options?.timeoutMs ??
        DEFAULT_UPLOAD_TIMEOUT_MS,
    },
  );
}

/**
 * Probe an absolute URL (rover discovery). Does not use getBackendURL().
 * Returns the HTTP status even for 4xx so callers can treat the host as reachable.
 */
export async function apiProbe(
  absoluteUrl: string,
  options: { timeoutMs?: number } = {},
): Promise<{ status: number }> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 5_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(absoluteUrl, {
      method: "GET",
      signal: controller.signal,
    });
    return { status: response.status };
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  apiPostMultipart,
  apiProbe,
  configureApiClient,
};

export default apiClient;
