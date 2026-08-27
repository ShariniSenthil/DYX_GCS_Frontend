import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("../../services/rtkService", () => ({
  listRtkProfiles: jest.fn(),
  getRtkStatus: jest.fn(),
  createRtkProfile: jest.fn(),
  updateRtkProfile: jest.fn(),
  deleteRtkProfile: jest.fn(),
  activateRtkProfile: jest.fn(),
  clearActiveRtkProfile: jest.fn(),
  startRtk: jest.fn(),
  stopRtk: jest.fn(),
  parseRtkApiError: jest.fn((error: unknown) => ({
    statusCode: (error as { statusCode?: number }).statusCode ?? null,
    code: (error as { code?: string }).code ?? null,
    message: error instanceof Error ? error.message : "error",
  })),
  formatRtkApiError: jest.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}));

import {
  activateRtkProfile,
  createRtkProfile,
  getRtkStatus,
  listRtkProfiles,
  startRtk,
  stopRtk,
  updateRtkProfile,
} from "../../services/rtkService";
import { RTK_STATUS_POLL_MS, useRtkControl } from "../useRtkControl";
import type { RtkProfile, RtkStatusResponse } from "../../types/rtk";
import { ApiError } from "../../services/apiError";

const mockList = listRtkProfiles as jest.MockedFunction<typeof listRtkProfiles>;
const mockStatus = getRtkStatus as jest.MockedFunction<typeof getRtkStatus>;
const mockStart = startRtk as jest.MockedFunction<typeof startRtk>;
const mockStop = stopRtk as jest.MockedFunction<typeof stopRtk>;
const mockCreate = createRtkProfile as jest.MockedFunction<typeof createRtkProfile>;
const mockUpdate = updateRtkProfile as jest.MockedFunction<typeof updateRtkProfile>;
const mockActivate = activateRtkProfile as jest.MockedFunction<typeof activateRtkProfile>;

const PROFILE: RtkProfile = {
  id: 4,
  name: "Base",
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

function statusResponse(
  desired: "STOPPED" | "RUNNING" = "STOPPED",
  manager: "STOPPED" | "STARTING" | "RUNNING" = "STOPPED",
): RtkStatusResponse {
  return {
    status: {
      persisted: {
        active_profile_id: 4,
        desired_state: desired,
        revision: 1,
        updated_at_epoch: 1,
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
          desired_state: desired,
          state: manager,
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
        mavros_ready: true,
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
        satellites_visible: 8,
        horizontal_accuracy_m: null,
        vertical_accuracy_m: null,
        hdop: null,
        vdop: null,
      },
    },
  };
}

function renderHook<T>(useHook: () => T) {
  const ref: { current: T } = { current: undefined as unknown as T };

  function Wrapper() {
    ref.current = useHook();
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let renderer: any;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Wrapper));
  });

  const rerender = (next: () => T) => {
    function NextWrapper() {
      ref.current = next();
      return null;
    }
    act(() => {
      renderer.update(React.createElement(NextWrapper));
    });
  };

  const unmount = () => {
    act(() => {
      renderer.unmount();
    });
  };

  return { result: ref, rerender, unmount };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockList.mockResolvedValue({ profiles: [PROFILE], count: 1 });
  mockStatus.mockResolvedValue(statusResponse());
  mockStart.mockResolvedValue({
    success: true,
    message: "RTK RUNNING intent accepted.",
    persisted: {
      active_profile_id: 4,
      desired_state: "RUNNING",
      revision: 2,
      updated_at_epoch: 2,
    },
  });
  mockStop.mockResolvedValue({
    success: true,
    message: "RTK STOPPED intent accepted.",
    persisted: {
      active_profile_id: 4,
      desired_state: "STOPPED",
      revision: 3,
      updated_at_epoch: 3,
    },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useRtkControl", () => {
  it("polls status every 3 seconds only while visible, with one in-flight poll", async () => {
    const { unmount } = renderHook(() =>
      useRtkControl({ visible: true, connected: true }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockStatus).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(RTK_STATUS_POLL_MS);
      await Promise.resolve();
    });
    expect(mockStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(RTK_STATUS_POLL_MS);
      await Promise.resolve();
    });
    expect(mockStatus).toHaveBeenCalledTimes(3);

    unmount();
    await act(async () => {
      jest.advanceTimersByTime(RTK_STATUS_POLL_MS * 3);
      await Promise.resolve();
    });
    expect(mockStatus).toHaveBeenCalledTimes(3);
  });

  it("does not poll when the screen is not visible", async () => {
    renderHook(() => useRtkControl({ visible: false, connected: true }));
    await act(async () => {
      jest.advanceTimersByTime(RTK_STATUS_POLL_MS * 2);
      await Promise.resolve();
    });
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it("ignores stale status after the screen closes", async () => {
    let resolveStatus: (value: RtkStatusResponse) => void = () => undefined;
    mockStatus.mockImplementation(
      () =>
        new Promise<RtkStatusResponse>((resolve) => {
          resolveStatus = resolve;
        }),
    );

    const { result, rerender } = renderHook(() =>
      useRtkControl({ visible: true, connected: true }),
    );

    rerender(() => useRtkControl({ visible: false, connected: true }));

    await act(async () => {
      resolveStatus(statusResponse("RUNNING", "RUNNING"));
      await Promise.resolve();
    });

    expect(result.current.status).toBeNull();
  });

  it("prevents overlapping mutations", async () => {
    let resolveStart: (value: Awaited<ReturnType<typeof startRtk>>) => void =
      () => undefined;
    mockStart.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useRtkControl({ visible: true, connected: true }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    await act(async () => {
      first = result.current.start();
      second = result.current.start();
    });

    const secondResult = await second;
    expect(secondResult).toMatchObject({ ok: false });
    expect(mockStart).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart({
        success: true,
        message: "RTK RUNNING intent accepted.",
        persisted: {
          active_profile_id: 4,
          desired_state: "RUNNING",
          revision: 2,
          updated_at_epoch: 2,
        },
      });
      await first;
    });
  });

  it("refreshes immediately after start and does not treat start as RTK Fixed", async () => {
    const { result } = renderHook(() =>
      useRtkControl({ visible: true, connected: true }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    mockStatus.mockResolvedValue(statusResponse("RUNNING", "STARTING"));

    await act(async () => {
      await result.current.start();
    });

    expect(mockStart).toHaveBeenCalledWith();
    expect(mockStatus.mock.calls.length).toBeGreaterThan(1);
    expect(result.current.view.headline).not.toBe("rtk_fixed");
    expect(result.current.view.headline).toBe("starting");
  });

  it("stop uses POST stop via stopRtk", async () => {
    const { result } = renderHook(() =>
      useRtkControl({ visible: true, connected: true }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.stop();
    });
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("surfaces 409 without a stack trace", async () => {
    mockActivate.mockRejectedValue(
      new ApiError("cannot request RUNNING without an active RTK profile", 409),
    );
    const { result } = renderHook(() =>
      useRtkControl({ visible: true, connected: true }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    let outcome: Awaited<ReturnType<typeof result.current.activateProfile>> | undefined;
    await act(async () => {
      outcome = await result.current.activateProfile(4);
    });
    expect(outcome).toBeDefined();
    expect(outcome?.ok).toBe(false);
    if (outcome && !outcome.ok) {
      expect(outcome.error.message).not.toMatch(/at Object/);
      expect(outcome.error.message).toContain("cannot request RUNNING");
    }
  });

  it("create and update go through the service and refresh", async () => {
    mockCreate.mockResolvedValue(PROFILE);
    mockUpdate.mockResolvedValue({ ...PROFILE, name: "Renamed" });
    const { result } = renderHook(() =>
      useRtkControl({ visible: true, connected: true }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.createProfile({
        name: "Base",
        caster_host: "caster.test",
        caster_port: 2101,
        mountpoint: "MOUNT",
        username: "rover",
        password: "secret",
      });
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.updateProfile(4, { name: "Renamed" });
    });
    expect(mockUpdate).toHaveBeenCalledWith(4, { name: "Renamed" });
  });
});
