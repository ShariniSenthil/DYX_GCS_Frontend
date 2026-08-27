/**
 * Production RTK client for the backend-owned profile + lifecycle API.
 *
 * Contract (rover_ws e57e050):
 *   GET    /api/rtk/profiles
 *   POST   /api/rtk/profiles
 *   GET    /api/rtk/profiles/{id}
 *   PATCH  /api/rtk/profiles/{id}
 *   DELETE /api/rtk/profiles/{id}
 *   POST   /api/rtk/profiles/{id}/activate
 *   DELETE /api/rtk/active-profile
 *   GET    /api/rtk/status
 *   POST   /api/rtk/start
 *   POST   /api/rtk/stop
 *
 * POST /start acknowledges desired RUNNING intent only.
 * It does not mean corrections are healthy or GNSS is RTK FIXED.
 *
 * NTRIP passwords are write-only. They are never logged, never stored in
 * returned snapshots, and omitted from PATCH when unchanged.
 */

import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
} from "./apiClient";
import { ApiError, NetworkError } from "./apiError";
import { PX4_RTK } from "../config/px4Endpoints";
import type {
  FastApiErrorBody,
  RtkActivateResponse,
  RtkApiErrorDetail,
  RtkIntentResponse,
  RtkParsedApiError,
  RtkProfile,
  RtkProfileCreateRequest,
  RtkProfileDeleteResponse,
  RtkProfileListResponse,
  RtkProfileResponse,
  RtkProfileUpdateRequest,
  RtkStatusResponse,
} from "../types/rtk";

export type {
  RtkStatusResponse,
  RtkProfile,
  RtkProfileCreateRequest,
  RtkProfileUpdateRequest,
} from "../types/rtk";

/**
 * Build a PATCH body. Blank / missing password means "unchanged" and is
 * omitted entirely. Password whitespace is preserved exactly.
 */
export function buildRtkProfileUpdateBody(
  dto: RtkProfileUpdateRequest,
): RtkProfileUpdateRequest {
  const body: RtkProfileUpdateRequest = { ...dto };

  if (body.password === undefined || body.password === null || body.password === "") {
    delete body.password;
  }

  return body;
}

function isRtkApiErrorDetail(value: unknown): value is RtkApiErrorDetail {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.code === "string" || typeof record.message === "string";
}

export function parseRtkApiError(error: unknown): RtkParsedApiError {
  if (error instanceof NetworkError) {
    return {
      statusCode: null,
      code: "NETWORK",
      message: error.message || "Rover offline",
    };
  }

  if (error instanceof ApiError) {
    let code: string | null = null;
    let message = error.message;

    if (error.responseBody) {
      try {
        const parsed = JSON.parse(error.responseBody) as FastApiErrorBody;
        const detail = parsed.detail;

        if (typeof detail === "string" && detail.trim()) {
          message = detail;
        } else if (isRtkApiErrorDetail(detail)) {
          if (typeof detail.code === "string" && detail.code) {
            code = detail.code;
          }
          if (typeof detail.message === "string" && detail.message) {
            message = detail.message;
          }
        } else if (Array.isArray(detail) && detail.length > 0) {
          const first = detail[0];
          if (first && typeof first.msg === "string" && first.msg) {
            message = first.msg;
          }
        }
      } catch {
        // Keep the already-classified ApiError message.
      }
    }

    return {
      statusCode: error.statusCode,
      code,
      message,
    };
  }

  if (error instanceof Error && error.message) {
    return {
      statusCode: null,
      code: null,
      message: error.message,
    };
  }

  return {
    statusCode: null,
    code: null,
    message: "RTK request failed",
  };
}

export function formatRtkApiError(error: unknown, fallback: string): string {
  const parsed = parseRtkApiError(error);
  if (!parsed.message) {
    return fallback;
  }
  if (parsed.code && parsed.code !== "NETWORK") {
    return parsed.message;
  }
  return parsed.message || fallback;
}

export async function listRtkProfiles(): Promise<RtkProfileListResponse> {
  return apiGet<RtkProfileListResponse>(PX4_RTK.PROFILES);
}

export async function getRtkProfile(id: number): Promise<RtkProfile> {
  const response = await apiGet<RtkProfileResponse>(PX4_RTK.PROFILE(id));
  return response.profile;
}

export async function createRtkProfile(
  dto: RtkProfileCreateRequest,
): Promise<RtkProfile> {
  const response = await apiPost<RtkProfileResponse>(PX4_RTK.PROFILES, dto);
  return response.profile;
}

export async function updateRtkProfile(
  id: number,
  dto: RtkProfileUpdateRequest,
): Promise<RtkProfile> {
  const response = await apiPatch<RtkProfileResponse>(
    PX4_RTK.PROFILE(id),
    buildRtkProfileUpdateBody(dto),
  );
  return response.profile;
}

export async function deleteRtkProfile(
  id: number,
): Promise<RtkProfileDeleteResponse> {
  return apiDelete<RtkProfileDeleteResponse>(PX4_RTK.PROFILE(id));
}

export async function activateRtkProfile(
  id: number,
): Promise<RtkActivateResponse> {
  return apiPost<RtkActivateResponse>(PX4_RTK.ACTIVATE(id));
}

export async function clearActiveRtkProfile(): Promise<RtkActivateResponse> {
  return apiDelete<RtkActivateResponse>(PX4_RTK.ACTIVE_PROFILE);
}

export async function getRtkStatus(): Promise<RtkStatusResponse> {
  return apiGet<RtkStatusResponse>(PX4_RTK.STATUS);
}

export async function startRtk(): Promise<RtkIntentResponse> {
  return apiPost<RtkIntentResponse>(PX4_RTK.START);
}

export async function stopRtk(): Promise<RtkIntentResponse> {
  return apiPost<RtkIntentResponse>(PX4_RTK.STOP);
}

export default {
  listRtkProfiles,
  getRtkProfile,
  createRtkProfile,
  updateRtkProfile,
  deleteRtkProfile,
  activateRtkProfile,
  clearActiveRtkProfile,
  getRtkStatus,
  startRtk,
  stopRtk,
  buildRtkProfileUpdateBody,
  parseRtkApiError,
  formatRtkApiError,
};
