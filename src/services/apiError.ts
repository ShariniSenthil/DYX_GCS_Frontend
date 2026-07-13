/**
 * API Error types — typed HTTP error hierarchy for 4WD_SERVER REST client.
 *
 * Usage:
 *   try { await apiGet(...) }
 *   catch (e) {
 *     if (e instanceof UnauthorizedError) { logout(); }
 *     if (e instanceof ConflictError) { showClearMissionPrompt(); }
 *   }
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    // Fix prototype chain for instanceof to work across TS compiled targets
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401 — token missing or invalid. Trigger logout flow. */
export class UnauthorizedError extends ApiError {
  constructor(body?: string) {
    super('Unauthorized — invalid or missing token', 401, body);
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 403 — authenticated but insufficient scope. */
export class ForbiddenError extends ApiError {
  constructor(body?: string) {
    super('Forbidden — insufficient permissions', 403, body);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 404 — resource (path, mission) not found. */
export class NotFoundError extends ApiError {
  constructor(resource?: string, body?: string) {
    super(resource ? `Not found: ${resource}` : 'Resource not found', 404, body);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 409 — conflict (e.g., protected mission, generation mismatch, wrong mode). */
export class ConflictError extends ApiError {
  constructor(message?: string, body?: string) {
    super(message ?? 'Conflict — operation not allowed in current state', 409, body);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 410 — resource gone (staged mission expired). */
export class GoneError extends ApiError {
  constructor(body?: string) {
    super('Gone — resource has expired or been removed', 410, body);
    this.name = 'GoneError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 422 — validation failure. */
export class UnprocessableError extends ApiError {
  constructor(body?: string) {
    super('Unprocessable entity — request validation failed', 422, body);
    this.name = 'UnprocessableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 503 — backend temporarily unavailable (FCU not connected, etc.). */
export class ServiceUnavailableError extends ApiError {
  constructor(body?: string) {
    super('Service unavailable — backend or FCU not ready', 503, body);
    this.name = 'ServiceUnavailableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Network-level error (no response received). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    const msg = cause instanceof Error ? cause.message : 'Network request failed';
    super(msg);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Map an HTTP status code to a typed ApiError.
 * Used by apiClient internally.
 */
export function classifyHttpError(status: number, body: string, path?: string): ApiError {
  switch (status) {
    case 401: return new UnauthorizedError(body);
    case 403: return new ForbiddenError(body);
    case 404: return new NotFoundError(path, body);
    case 409: return new ConflictError(undefined, body);
    case 410: return new GoneError(body);
    case 422: return new UnprocessableError(body);
    case 503: return new ServiceUnavailableError(body);
    default: return new ApiError(`HTTP ${status}: ${body}`, status, body);
  }
}
