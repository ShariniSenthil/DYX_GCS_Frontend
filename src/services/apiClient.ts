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

// ── Internal request function ─────────────────────────────────────────────────

async function request<T>(
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

    throw new NetworkError(
      error,
    );
  } finally {
    clearTimeout(
      timeoutId,
    );
  }
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

export const apiClient = {
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  apiPostMultipart,
  configureApiClient,
};

export default apiClient;