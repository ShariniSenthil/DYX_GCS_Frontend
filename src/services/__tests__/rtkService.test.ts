jest.mock("../../services/apiClient", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPatch: jest.fn(),
  apiDelete: jest.fn(),
}));

import { apiDelete, apiGet, apiPatch, apiPost } from "../../services/apiClient";
import { PX4_RTK } from "../../config/px4Endpoints";
import { ApiError, NetworkError } from "../../services/apiError";
import {
  activateRtkProfile,
  buildRtkProfileUpdateBody,
  clearActiveRtkProfile,
  createRtkProfile,
  deleteRtkProfile,
  formatRtkApiError,
  getRtkProfile,
  getRtkStatus,
  listRtkProfiles,
  parseRtkApiError,
  startRtk,
  stopRtk,
  updateRtkProfile,
} from "../rtkService";
import type { RtkProfile, RtkStatusResponse } from "../../types/rtk";
import { toRtkControlView } from "../../adapters/rtkControlAdapter";

const mockGet = apiGet as jest.MockedFunction<typeof apiGet>;
const mockPost = apiPost as jest.MockedFunction<typeof apiPost>;
const mockPatch = apiPatch as jest.MockedFunction<typeof apiPatch>;
const mockDelete = apiDelete as jest.MockedFunction<typeof apiDelete>;

const PROFILE: RtkProfile = {
  id: 7,
  name: "Office Base",
  caster_host: "caster.test",
  caster_port: 2101,
  mountpoint: "MOUNT",
  username: "rover",
  password_configured: true,
  rtcm_topic: "/mavros/gps_rtk/send_rtcm",
  connect_timeout_sec: 10,
  socket_timeout_sec: 1,
  healthy_age_sec: 5,
  stale_reconnect_sec: 10,
  reconnect_delay_sec: 5,
  first_data_timeout_sec: 10,
  gga_enabled: false,
  gga_interval_sec: 10,
  gga_max_age_sec: 5,
  tls_mode: "REQUIRED",
  max_mavros_rtcm_frame_bytes: 720,
  enabled: true,
  revision: 1,
  created_at_epoch: 1,
  updated_at_epoch: 1,
};

const STATUS: RtkStatusResponse = {
  status: {
    persisted: {
      active_profile_id: 7,
      desired_state: "STOPPED",
      revision: 3,
      updated_at_epoch: 10,
    },
    active_profile: PROFILE,
    runtime: {
      supervisor: {
        running: true,
        shutdown_requested: false,
        mavros_ready: true,
        last_error_code: null,
      },
      manager: {
        desired_state: "STOPPED",
        state: "STOPPED",
        mavros_ready: true,
        active_run_id: null,
        child_started: false,
        child_ready: false,
        next_restart_at_monotonic_sec: null,
        consecutive_failures: 0,
        restart_count_in_window: 0,
        error_reason: null,
      },
      process: null,
      last_worker_status: null,
      last_process_returncode: null,
      last_protocol_fault_run_id: null,
    },
    correction_stream: {
      state: "UNAVAILABLE",
      connected: false,
      healthy: false,
      correction_age_sec: null,
      socket_bytes_received: 0,
      valid_frames: 0,
      published_frames: 0,
      crc_failures: 0,
      invalid_headers: 0,
      resync_bytes_discarded: 0,
      partial_frame_timeouts: 0,
      oversize_drops: 0,
      publish_errors: 0,
      mavros_ready: false,
      mavros_rtcm_subscribers: 0,
      worker_mavros_subscribers: -1,
      max_mavros_rtcm_frame_bytes: 720,
      gga: {
        enabled: false,
        state: "DISABLED",
        source_age_sec: null,
        last_sent_age_sec: null,
        sent_total: 0,
        send_errors: 0,
      },
    },
    gnss_solution: {
      fix_type: 3,
      fix_name: "3D_FIX",
      rtk_float: false,
      rtk_fixed: false,
      satellites_visible: 12,
      horizontal_accuracy_m: 1.2,
      vertical_accuracy_m: 2.1,
      hdop: 0.9,
      vdop: 1.1,
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("rtkService endpoints", () => {
  it("listRtkProfiles GETs /api/rtk/profiles", async () => {
    mockGet.mockResolvedValue({ profiles: [PROFILE], count: 1 });
    const result = await listRtkProfiles();
    expect(mockGet).toHaveBeenCalledWith(PX4_RTK.PROFILES);
    expect(PX4_RTK.PROFILES).toBe("/api/rtk/profiles");
    expect(result.profiles[0]).not.toHaveProperty("password");
    expect(result.profiles[0].password_configured).toBe(true);
  });

  it("getRtkProfile GETs /api/rtk/profiles/{id}", async () => {
    mockGet.mockResolvedValue({ profile: PROFILE });
    const profile = await getRtkProfile(7);
    expect(mockGet).toHaveBeenCalledWith("/api/rtk/profiles/7");
    expect(profile).not.toHaveProperty("password");
  });

  it("createRtkProfile POSTs /api/rtk/profiles with write-only password", async () => {
    mockPost.mockResolvedValue({ profile: PROFILE });
    const created = await createRtkProfile({
      name: "Office Base",
      caster_host: "caster.test",
      caster_port: 2101,
      mountpoint: "MOUNT",
      username: "rover",
      password: "  secret  ",
      tls_mode: "REQUIRED",
    });
    expect(mockPost).toHaveBeenCalledWith("/api/rtk/profiles", {
      name: "Office Base",
      caster_host: "caster.test",
      caster_port: 2101,
      mountpoint: "MOUNT",
      username: "rover",
      password: "  secret  ",
      tls_mode: "REQUIRED",
    });
    expect(created).not.toHaveProperty("password");
  });

  it("updateRtkProfile PATCHes and omits blank password", async () => {
    mockPatch.mockResolvedValue({ profile: PROFILE });
    await updateRtkProfile(7, {
      name: "Office Base",
      password: "",
    });
    expect(mockPatch).toHaveBeenCalledWith("/api/rtk/profiles/7", {
      name: "Office Base",
    });
    const body = mockPatch.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("password");
  });

  it("updateRtkProfile preserves password whitespace and does not trim", async () => {
    mockPatch.mockResolvedValue({ profile: PROFILE });
    await updateRtkProfile(7, { password: "  keep  " });
    expect(mockPatch).toHaveBeenCalledWith("/api/rtk/profiles/7", {
      password: "  keep  ",
    });
  });

  it("deleteRtkProfile DELETEs /api/rtk/profiles/{id}", async () => {
    mockDelete.mockResolvedValue({ success: true, deleted_profile_id: 7 });
    await deleteRtkProfile(7);
    expect(mockDelete).toHaveBeenCalledWith("/api/rtk/profiles/7");
  });

  it("activateRtkProfile POSTs /api/rtk/profiles/{id}/activate", async () => {
    mockPost.mockResolvedValue({
      success: true,
      persisted: STATUS.status.persisted,
    });
    await activateRtkProfile(7);
    expect(mockPost).toHaveBeenCalledWith("/api/rtk/profiles/7/activate");
  });

  it("clearActiveRtkProfile DELETEs /api/rtk/active-profile", async () => {
    mockDelete.mockResolvedValue({
      success: true,
      persisted: { ...STATUS.status.persisted, active_profile_id: null },
    });
    await clearActiveRtkProfile();
    expect(mockDelete).toHaveBeenCalledWith("/api/rtk/active-profile");
  });

  it("getRtkStatus GETs nested correction_stream and gnss_solution", async () => {
    mockGet.mockResolvedValue(STATUS);
    const response = await getRtkStatus();
    expect(mockGet).toHaveBeenCalledWith("/api/rtk/status");
    expect(response.status.correction_stream.healthy).toBe(false);
    expect(response.status.gnss_solution.fix_type).toBe(3);
    expect(response.status.active_profile).not.toHaveProperty("password");
    expect(response.status.correction_stream.gga.state).toBe("DISABLED");
    expect(response.status.active_profile?.tls_mode).toBe("REQUIRED");
  });

  it("startRtk POSTs /api/rtk/start with no credentials", async () => {
    mockPost.mockResolvedValue({
      success: true,
      message: "RTK RUNNING intent accepted.",
      persisted: { ...STATUS.status.persisted, desired_state: "RUNNING" },
    });
    const result = await startRtk();
    expect(mockPost).toHaveBeenCalledWith("/api/rtk/start");
    expect(mockPost.mock.calls[0]).toHaveLength(1);
    expect(result.success).toBe(true);
    expect(toRtkControlView(result as never).headline).not.toBe("rtk_fixed");
    expect(toRtkControlView(result as never).headline).not.toBe("rtk_float");
    expect(toRtkControlView(result as never).headline).not.toBe(
      "corrections_active",
    );
  });

  it("stopRtk POSTs /api/rtk/stop and does not throw locally", async () => {
    mockPost.mockResolvedValue({
      success: true,
      message: "RTK STOPPED intent accepted.",
      persisted: { ...STATUS.status.persisted, desired_state: "STOPPED" },
    });
    await expect(stopRtk()).resolves.toMatchObject({ success: true });
    expect(mockPost).toHaveBeenCalledWith("/api/rtk/stop");
  });
});

describe("buildRtkProfileUpdateBody", () => {
  it("omits undefined, null, and blank password", () => {
    expect(buildRtkProfileUpdateBody({ name: "A" })).not.toHaveProperty(
      "password",
    );
    expect(
      buildRtkProfileUpdateBody({ name: "A", password: undefined }),
    ).not.toHaveProperty("password");
    expect(
      buildRtkProfileUpdateBody({ name: "A", password: "" }),
    ).not.toHaveProperty("password");
  });

  it("keeps a whitespace-only password because it is a real secret", () => {
    expect(buildRtkProfileUpdateBody({ password: " " })).toEqual({
      password: " ",
    });
  });
});

describe("parseRtkApiError", () => {
  const body = (code: string, message: string) =>
    JSON.stringify({ detail: { code, message } });

  it("parses 404 RTK_PROFILE_NOT_FOUND", () => {
    const parsed = parseRtkApiError(
      new ApiError("not found", 404, body("RTK_PROFILE_NOT_FOUND", "RTK profile not found.")),
    );
    expect(parsed.statusCode).toBe(404);
    expect(parsed.code).toBe("RTK_PROFILE_NOT_FOUND");
    expect(parsed.message).toBe("RTK profile not found.");
  });

  it("parses 409 RTK_STATE_CONFLICT", () => {
    const parsed = parseRtkApiError(
      new ApiError(
        "conflict",
        409,
        body("RTK_STATE_CONFLICT", "cannot request RUNNING without an active RTK profile"),
      ),
    );
    expect(parsed.statusCode).toBe(409);
    expect(parsed.code).toBe("RTK_STATE_CONFLICT");
  });

  it("parses 422 RTK_PROFILE_INVALID", () => {
    const parsed = parseRtkApiError(
      new ApiError("invalid", 422, body("RTK_PROFILE_INVALID", "tls_mode must be REQUIRED or DISABLED")),
    );
    expect(parsed.statusCode).toBe(422);
    expect(parsed.code).toBe("RTK_PROFILE_INVALID");
  });

  it("parses 503 RTK_CONTROL_UNAVAILABLE", () => {
    const parsed = parseRtkApiError(
      new ApiError(
        "unavailable",
        503,
        body("RTK_CONTROL_UNAVAILABLE", "RTK control service is not available."),
      ),
    );
    expect(parsed.statusCode).toBe(503);
    expect(parsed.code).toBe("RTK_CONTROL_UNAVAILABLE");
  });

  it("maps NetworkError to rover offline without a stack", () => {
    const parsed = parseRtkApiError(new NetworkError(new Error("failed")));
    expect(parsed.code).toBe("NETWORK");
    expect(parsed.message.toLowerCase()).not.toContain("at Object");
    expect(formatRtkApiError(new NetworkError(), "offline")).toBeTruthy();
  });
});

describe("obsolete RTK paths", () => {
  it("does not expose /api/rtk/config or /api/rtk/reconnect constants", () => {
    const values = Object.values(PX4_RTK).map((value) =>
      typeof value === "function" ? value(1) : value,
    );
    expect(values).not.toContain("/api/rtk/config");
    expect(values).not.toContain("/api/rtk/reconnect");
  });
});
