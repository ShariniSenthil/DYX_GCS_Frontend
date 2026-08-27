import type {
  RtkCorrectionStreamState,
  RtkIntentResponse,
  RtkManagerState,
  RtkProfile,
  RtkStatus,
  RtkStatusResponse,
} from "../../types/rtk";
import {
  decideMissionRtkQuickStart,
  deriveRtkHeadline,
  isRuntimeSignificantProfileChange,
  toRtkControlView,
} from "../rtkControlAdapter";

const PROFILE: RtkProfile = {
  id: 3,
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
  gga_enabled: true,
  gga_interval_sec: 10,
  gga_max_age_sec: 5,
  tls_mode: "REQUIRED",
  max_mavros_rtcm_frame_bytes: 720,
  enabled: true,
  revision: 4,
  created_at_epoch: 1,
  updated_at_epoch: 2,
};

function makeStatus(over: {
  desired?: RtkStatus["persisted"]["desired_state"];
  manager?: RtkManagerState | null;
  streamState?: RtkCorrectionStreamState;
  streamHealthy?: boolean;
  streamConnected?: boolean;
  fixType?: number;
  fixName?: string;
  rtkFloat?: boolean;
  rtkFixed?: boolean;
  errorReason?: RtkStatus["runtime"]["manager"] extends infer M
    ? M extends { error_reason: infer E }
      ? E
      : never
    : never;
  activeProfile?: RtkProfile | null;
  mavrosReady?: boolean;
} = {}): RtkStatusResponse {
  const fixType = over.fixType ?? 0;
  const manager = over.manager === undefined ? "STOPPED" : over.manager;
  const desired = over.desired ?? "STOPPED";

  const status: RtkStatus = {
    persisted: {
      active_profile_id: over.activeProfile === null ? null : 3,
      desired_state: desired,
      revision: 8,
      updated_at_epoch: 100,
    },
    active_profile: over.activeProfile === undefined ? PROFILE : over.activeProfile,
    runtime: {
      supervisor: {
        running: true,
        shutdown_requested: false,
        mavros_ready: over.mavrosReady ?? true,
        last_error_code: null,
      },
      manager:
        manager == null
          ? null
          : {
              desired_state: desired,
              state: manager,
              mavros_ready: over.mavrosReady ?? true,
              active_run_id: manager === "STOPPED" ? null : "run-1",
              child_started: manager === "RUNNING" || manager === "RUNNING_MAVROS_STALE",
              child_ready: manager === "RUNNING" || manager === "RUNNING_MAVROS_STALE",
              next_restart_at_monotonic_sec: manager === "BACKOFF" ? 12.5 : null,
              consecutive_failures: manager === "BACKOFF" ? 2 : 0,
              restart_count_in_window: manager === "BACKOFF" ? 2 : 0,
              error_reason: over.errorReason ?? (manager === "ERROR" ? "AUTH_FAILED" : null),
            },
      process: null,
      last_worker_status: null,
      last_process_returncode: null,
      last_protocol_fault_run_id: null,
    },
    correction_stream: {
      state: over.streamState ?? "UNAVAILABLE",
      connected: over.streamConnected ?? Boolean(over.streamHealthy),
      healthy: over.streamHealthy ?? false,
      correction_age_sec: over.streamHealthy ? 0.2 : null,
      socket_bytes_received: over.streamHealthy ? 4096 : 0,
      valid_frames: over.streamHealthy ? 40 : 0,
      published_frames: over.streamHealthy ? 38 : 0,
      crc_failures: 0,
      invalid_headers: 0,
      resync_bytes_discarded: 0,
      partial_frame_timeouts: 0,
      oversize_drops: 0,
      publish_errors: 0,
      mavros_ready: over.mavrosReady ?? true,
      mavros_rtcm_subscribers: 1,
      worker_mavros_subscribers: 1,
      max_mavros_rtcm_frame_bytes: 720,
      gga: {
        enabled: true,
        state: "READY",
        source_age_sec: 0.4,
        last_sent_age_sec: 1.1,
        sent_total: 9,
        send_errors: 0,
      },
    },
    gnss_solution: {
      fix_type: fixType,
      fix_name: over.fixName ?? (fixType === 6 ? "RTK_FIXED" : fixType === 5 ? "RTK_FLOAT" : "3D_FIX"),
      rtk_float: over.rtkFloat ?? fixType === 5,
      rtk_fixed: over.rtkFixed ?? fixType === 6,
      satellites_visible: 18,
      horizontal_accuracy_m: 0.02,
      vertical_accuracy_m: 0.04,
      hdop: 0.7,
      vdop: 1.0,
    },
  };

  return { status };
}

describe("toRtkControlView manager states", () => {
  const cases: Array<[RtkManagerState, string]> = [
    ["STOPPED", "off"],
    ["WAITING_FOR_MAVROS", "waiting_for_mavros"],
    ["STARTING", "starting"],
    ["BACKOFF", "reconnecting"],
    ["STOPPING", "stopping"],
    ["ERROR", "terminal_error"],
    ["RUNNING_MAVROS_STALE", "mavros_lost"],
  ];

  test.each(cases)("%s -> %s", (manager, headline) => {
    const desired = manager === "STOPPED" || manager === "STOPPING" ? "STOPPED" : "RUNNING";
    expect(
      toRtkControlView(makeStatus({ manager, desired })).headline,
    ).toBe(headline);
  });

  it("RUNNING + healthy corrections + fix 6 = RTK Fixed", () => {
    const view = toRtkControlView(
      makeStatus({
        desired: "RUNNING",
        manager: "RUNNING",
        streamHealthy: true,
        streamState: "HEALTHY",
        fixType: 6,
      }),
    );
    expect(view.headline).toBe("rtk_fixed");
    expect(view.tone).toBe("healthy");
    expect(view.correctionHealthy).toBe(true);
    expect(view.rtkFixed).toBe(true);
  });

  it("RUNNING + healthy corrections + fix 5 = RTK Float", () => {
    expect(
      toRtkControlView(
        makeStatus({
          desired: "RUNNING",
          manager: "RUNNING",
          streamHealthy: true,
          streamState: "HEALTHY",
          fixType: 5,
        }),
      ).headline,
    ).toBe("rtk_float");
  });

  it("RUNNING + healthy corrections + fix 3 != RTK Fixed", () => {
    const view = toRtkControlView(
      makeStatus({
        desired: "RUNNING",
        manager: "RUNNING",
        streamHealthy: true,
        streamState: "HEALTHY",
        fixType: 3,
        fixName: "3D_FIX",
      }),
    );
    expect(view.headline).toBe("corrections_active");
    expect(view.headline).not.toBe("rtk_fixed");
    expect(view.rtkFixed).toBe(false);
  });

  it("RUNNING + unhealthy corrections is Degraded even with last RTK fix", () => {
    const view = toRtkControlView(
      makeStatus({
        desired: "RUNNING",
        manager: "RUNNING",
        streamHealthy: false,
        streamState: "UNHEALTHY",
        fixType: 6,
      }),
    );
    expect(view.headline).toBe("degraded");
    expect(view.rtkFixed).toBe(true);
    expect(view.correctionHealthy).toBe(false);
  });

  it("desired STOPPED maps to Off", () => {
    expect(
      toRtkControlView(makeStatus({ desired: "STOPPED", manager: "STOPPED" }))
        .headline,
    ).toBe("off");
  });

  it("desired RUNNING with manager still STOPPED is Start Requested", () => {
    expect(
      toRtkControlView(makeStatus({ desired: "RUNNING", manager: "STOPPED" }))
        .headline,
    ).toBe("start_requested");
  });
});

describe("start response is not RTK success", () => {
  it("does not treat POST /start JSON as RTK Fixed", () => {
    const startResponse: RtkIntentResponse = {
      success: true,
      message: "RTK RUNNING intent accepted.",
      persisted: {
        active_profile_id: 3,
        desired_state: "RUNNING",
        revision: 9,
        updated_at_epoch: 111,
      },
    };

    const view = toRtkControlView(startResponse as never);
    expect(view.headline).not.toBe("rtk_fixed");
    expect(view.headline).not.toBe("rtk_float");
    expect(view.headline).not.toBe("corrections_active");
    expect(view.correctionHealthy).toBe(false);
  });
});

describe("nested telemetry projection", () => {
  it("exposes correction stream independently from GNSS", () => {
    const view = toRtkControlView(
      makeStatus({
        desired: "RUNNING",
        manager: "RUNNING",
        streamHealthy: true,
        streamState: "HEALTHY",
        fixType: 5,
      }),
    );
    expect(view.correctionState).toBe("HEALTHY");
    expect(view.publishedFrames).toBe(38);
    expect(view.socketBytesReceived).toBe(4096);
    expect(view.gnssFixName).toBe("RTK_FLOAT");
    expect(view.ggaEnabled).toBe(true);
    expect(view.ggaState).toBe("READY");
    expect(view.activeProfile?.tls_mode).toBe("REQUIRED");
    expect(view.activeProfile).not.toHaveProperty("password");
  });

  it("marks rover offline when disconnected", () => {
    const view = toRtkControlView(makeStatus(), { connected: false });
    expect(view.headline).toBe("rover_offline");
    expect(view.canStart).toBe(false);
    expect(view.canStop).toBe(false);
    expect(view.disabledReason).toBe("Rover Offline");
  });
});

describe("TLS typing", () => {
  it("accepts DISABLED as an explicit plaintext policy", () => {
    const disabled: RtkProfile = { ...PROFILE, tls_mode: "DISABLED" };
    const view = toRtkControlView(
      makeStatus({ activeProfile: disabled }),
    );
    expect(view.activeProfile?.tls_mode).toBe("DISABLED");
  });
});

describe("mission quick start decision", () => {
  it("opens shared config when no active backend profile", () => {
    expect(
      decideMissionRtkQuickStart({ connected: true, activeProfileId: null }),
    ).toBe("open_config");
  });

  it("starts without credentials when an active profile exists", () => {
    expect(
      decideMissionRtkQuickStart({ connected: true, activeProfileId: 3 }),
    ).toBe("start");
  });
});

describe("runtime-significant edits", () => {
  it("treats caster/password/tls/gga as significant and name as not", () => {
    expect(isRuntimeSignificantProfileChange({ name: "New" })).toBe(false);
    expect(isRuntimeSignificantProfileChange({ caster_host: "x" })).toBe(true);
    expect(isRuntimeSignificantProfileChange({ password: "x" })).toBe(true);
    expect(isRuntimeSignificantProfileChange({ tls_mode: "DISABLED" })).toBe(
      true,
    );
    expect(isRuntimeSignificantProfileChange({ gga_enabled: true })).toBe(true);
  });
});

describe("deriveRtkHeadline", () => {
  it("never collapses healthy corrections into RTK Fixed", () => {
    const status = makeStatus({
      desired: "RUNNING",
      manager: "RUNNING",
      streamHealthy: true,
      fixType: 4,
    }).status;
    expect(deriveRtkHeadline(status)).toBe("corrections_active");
  });
});
