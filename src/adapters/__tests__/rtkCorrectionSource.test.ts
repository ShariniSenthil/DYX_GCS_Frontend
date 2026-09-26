import type {
  RtkCorrectionSource,
  RtkProfile,
  RtkStatus,
} from "../../types/rtk";
import {
  decideMissionRtkQuickStart,
  loraStartProblem,
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

const RADIO = "/dev/serial/by-id/usb-FTDI_FT231X-if00-port0";
const RECEIVER = "/dev/serial/by-id/usb-Septentrio_Septentrio_USB_Device_3804732-if04";

function lora(over: Partial<RtkCorrectionSource> = {}): RtkCorrectionSource {
  return {
    source: "LORA",
    lora_serial_device: RADIO,
    lora_serial_baud: 57600,
    lora_direct_inject: true,
    lora_direct_serial_device: RECEIVER,
    lora_direct_serial_baud: 230400,
    revision: 2,
    updated_at: 1,
    ...over,
  };
}

function status(over: {
  source?: RtkCorrectionSource | undefined;
  activeProfile?: RtkProfile | null;
  desired?: "STOPPED" | "RUNNING";
} = {}): RtkStatus {
  const active = over.activeProfile === undefined ? PROFILE : over.activeProfile;
  return {
    persisted: {
      active_profile_id: active ? active.id : null,
      desired_state: over.desired ?? "STOPPED",
      revision: 1,
      updated_at_epoch: 1,
    },
    active_profile: active,
    runtime: {
      supervisor: {
        running: true,
        shutdown_requested: false,
        mavros_ready: true,
        last_error_code: null,
      },
      manager: {
        desired_state: over.desired ?? "STOPPED",
        state: over.desired === "RUNNING" ? "RUNNING" : "STOPPED",
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
      state: "DISCONNECTED",
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
      mavros_rtcm_subscribers: 1,
      worker_mavros_subscribers: 1,
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
      horizontal_accuracy_m: null,
      vertical_accuracy_m: null,
      hdop: null,
      vdop: null,
    },
    correction_source: over.source,
  };
}

describe("correction source in the RTK view", () => {
  it("treats an older backend without correction_source as NTRIP", () => {
    const view = toRtkControlView(status({ source: undefined }));
    expect(view.correctionSource).toBe("NTRIP");
    expect(view.canStart).toBe(true);
  });

  it("lets a configured LoRa source start without any NTRIP profile", () => {
    const view = toRtkControlView(
      status({ source: lora(), activeProfile: null }),
    );
    expect(view.correctionSource).toBe("LORA");
    expect(view.loraConfigured).toBe(true);
    expect(view.canStart).toBe(true);
    expect(view.disabledReason).toBeNull();
  });

  it("blocks LoRa start until the radio port is set", () => {
    const view = toRtkControlView(
      status({ source: lora({ lora_serial_device: null }), activeProfile: null }),
    );
    expect(view.canStart).toBe(false);
    expect(view.disabledReason).toBe("Select the LoRa radio port");
  });

  it("requires the receiver port only for direct output", () => {
    const direct = toRtkControlView(
      status({ source: lora({ lora_direct_serial_device: null }) }),
    );
    expect(direct.canStart).toBe(false);
    expect(direct.disabledReason).toBe("Select the GNSS receiver output port");

    const viaMavros = toRtkControlView(
      status({
        source: lora({ lora_direct_inject: false, lora_direct_serial_device: null }),
      }),
    );
    expect(viaMavros.canStart).toBe(true);
  });

  it("keeps the NTRIP active-profile rule when NTRIP is the source", () => {
    const view = toRtkControlView(
      status({ source: lora({ source: "NTRIP" }), activeProfile: null }),
    );
    expect(view.correctionSource).toBe("NTRIP");
    expect(view.canStart).toBe(false);
    expect(view.disabledReason).toBe(
      "Activate a backend RTK profile before starting",
    );
  });

  it("never allows start while RUNNING, whichever the source", () => {
    const view = toRtkControlView(status({ source: lora(), desired: "RUNNING" }));
    expect(view.canStart).toBe(false);
    expect(view.canStop).toBe(true);
  });

  it("loraStartProblem mirrors the backend start check", () => {
    expect(loraStartProblem(null)).toBe("LoRa settings not loaded");
    expect(loraStartProblem(lora())).toBeNull();
  });
});

describe("mission quick start with LoRa", () => {
  it("starts a configured LoRa source without an NTRIP profile", () => {
    expect(
      decideMissionRtkQuickStart({
        connected: true,
        activeProfileId: null,
        correctionSource: "LORA",
        loraConfigured: true,
      }),
    ).toBe("start");
  });

  it("opens configuration when LoRa is not configured", () => {
    expect(
      decideMissionRtkQuickStart({
        connected: true,
        activeProfileId: 3,
        correctionSource: "LORA",
        loraConfigured: false,
      }),
    ).toBe("open_config");
  });

  it("keeps NTRIP behaviour when no source is given", () => {
    expect(
      decideMissionRtkQuickStart({ connected: true, activeProfileId: null }),
    ).toBe("open_config");
    expect(
      decideMissionRtkQuickStart({ connected: false, activeProfileId: 3, correctionSource: "LORA", loraConfigured: true }),
    ).toBe("offline");
  });
});
