/**
 * API error types for the DYX 4WD Rover.
 *
 * IMPORTANT:
 * Backend control errors contain the real rover failure reason:
 *
 * {
 *   "detail": {
 *     "success": false,
 *     "operation": "start",
 *     "message": "Start blocked at PRECHECK: ...",
 *     "mission": {...}
 *   }
 * }
 *
 * Never replace that useful reason with only "HTTP 409 Conflict".
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string,
  ) {
    super(message);

    this.name = "ApiError";

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}


/**
 * Extract the most useful human-readable error from FastAPI responses.
 */
function extractBackendMessage(
  body: string | undefined,
  fallback: string,
): string {
  const raw = String(body ?? "").trim();

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw);

    /*
     * FastAPI:
     *
     * {
     *   detail: "..."
     * }
     */
    if (
      typeof parsed?.detail === "string" &&
      parsed.detail.trim()
    ) {
      return parsed.detail.trim();
    }

    /*
     * Rover mission API:
     *
     * {
     *   detail: {
     *     message: "Start blocked at PRECHECK: ...",
     *     ...
     *   }
     * }
     */
    if (
      parsed?.detail &&
      typeof parsed.detail === "object"
    ) {
      const detail = parsed.detail;

      const candidates = [
        detail.message,
        detail.error,
        detail.reason,
      ];

      for (const candidate of candidates) {
        if (
          typeof candidate === "string" &&
          candidate.trim()
        ) {
          return candidate.trim();
        }
      }

      /*
       * If mission_manager status was returned inside the error,
       * use its error/message as another fallback.
       */
      const mission = detail.mission;

      if (
        mission &&
        typeof mission === "object"
      ) {
        const missionCandidates = [
          mission.error,
          mission.message,
        ];

        for (
          const candidate of missionCandidates
        ) {
          if (
            typeof candidate === "string" &&
            candidate.trim()
          ) {
            return candidate.trim();
          }
        }
      }
    }

    /*
     * Generic API responses.
     */
    const candidates = [
      parsed?.message,
      parsed?.error,
      parsed?.reason,
    ];

    for (const candidate of candidates) {
      if (
        typeof candidate === "string" &&
        candidate.trim()
      ) {
        return candidate.trim();
      }
    }
  } catch {
    /*
     * Non-JSON backend response.
     */
    return raw;
  }

  return fallback;
}


/** 401 */
export class UnauthorizedError extends ApiError {
  constructor(body?: string) {
    super(
      extractBackendMessage(
        body,
        "Unauthorized — invalid or missing token",
      ),
      401,
      body,
    );

    this.name = "UnauthorizedError";

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}


/** 403 */
export class ForbiddenError extends ApiError {
  constructor(body?: string) {
    super(
      extractBackendMessage(
        body,
        "Forbidden — insufficient permissions",
      ),
      403,
      body,
    );

    this.name = "ForbiddenError";

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}


/** 404 */
export class NotFoundError extends ApiError {
  constructor(
    resource?: string,
    body?: string,
  ) {
    const fallback = resource
      ? `Not found: ${resource}`
      : "Resource not found";

    super(
      extractBackendMessage(
        body,
        fallback,
      ),
      404,
      body,
    );

    this.name = "NotFoundError";

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}


/** 409 — mission/control conflict */
export class ConflictError extends ApiError {
  constructor(
    message?: string,
    body?: string,
  ) {
    super(
      message ??
        extractBackendMessage(
          body,
          "Conflict — operation not allowed in current state",
        ),
      409,
      body,
    );

    this.name = "ConflictError";

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}


/** 410 */
export class GoneError extends ApiError {
  constructor(body?: string) {
    super(
      extractBackendMessage(
        body,
        "Resource has expired or been removed",
      ),
      410,
      body,
    );

    this.name = "GoneError";

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}


/** 422 */
export class UnprocessableError extends ApiError {
  constructor(body?: string) {
    super(
      extractBackendMessage(
        body,
        "Request validation failed",
      ),
      422,
      body,
    );

    this.name = "UnprocessableError";

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}


/** 503 */
export class ServiceUnavailableError extends ApiError {
  constructor(body?: string) {
    super(
      extractBackendMessage(
        body,
        "Backend or rover service is unavailable",
      ),
      503,
      body,
    );

    this.name = "ServiceUnavailableError";

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}


/** Network-level error */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Network request failed";

    super(message);

    this.name = "NetworkError";

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}


/**
 * Map HTTP status → typed rover error.
 *
 * The important rule is:
 *
 * PRESERVE THE BACKEND FAILURE MESSAGE.
 */
export function classifyHttpError(
  status: number,
  body: string,
  path?: string,
): ApiError {
  switch (status) {
    case 401:
      return new UnauthorizedError(body);

    case 403:
      return new ForbiddenError(body);

    case 404:
      return new NotFoundError(
        path,
        body,
      );

    case 409:
      return new ConflictError(
        undefined,
        body,
      );

    case 410:
      return new GoneError(body);

    case 422:
      return new UnprocessableError(
        body,
      );

    case 503:
      return new ServiceUnavailableError(
        body,
      );

    default:
      return new ApiError(
        extractBackendMessage(
          body,
          `HTTP ${status}`,
        ),
        status,
        body,
      );
  }
}
