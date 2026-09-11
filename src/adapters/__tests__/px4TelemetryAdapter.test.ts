import {
  flattenRppFields,
  isPx4Payload,
  mergeMissionStatus,
  toLiveTelemetryEnvelope,
  toRoverTelemetry,
  toTelemetryEnvelopeFromRoverData,
  unwrapTelemetryPayload,
} from "../px4TelemetryAdapter";
import type { RoverTelemetry } from "../../types/telemetry";

function makeBaseTelemetry(
  overrides: Partial<RoverTelemetry> = {},
): RoverTelemetry {
  return {
    state: {
      armed: false,
      mode: "OFFBOARD",
      system_status: "ACTIVE",
      heartbeat_ts: 1,
    },
    global: {
      lat: 25.1,
      lon: 55.2,
      alt_rel: 0,
      vel: 0.4,
      satellites_visible: 18,
    },
    battery: {
      voltage: 24,
      current: 1,
      percentage: 80,
    },
    rtk: {
      fix_type: 6,
      baseline_age: 0,
      base_linked: true,
    },
    mission: {
      total_wp: 4,
      current_wp: 2,
      status: "RUNNING",
      progress_pct: 50,
      rpp_state: 4,
      rpp_state_name: "FOLLOWING",
    },
    servo: {
      servo_id: 0,
      active: false,
      last_command_ts: 0,
    },
    network: {
      connection_type: "wifi",
      wifi_signal_strength: 70,
      wifi_rssi: -50,
      interface: "wlan0",
      wifi_connected: true,
      lora_connected: false,
    },
    hrms: 0.01,
    vrms: 0.02,
    imu_status: "OK",
    lastMessageTs: 1,
    rpp_state_name: "FOLLOWING",
    rpp_debug_available: true,
    rpp_actual_speed_mps: 0.42,
    rpp_cross_track_error_mm: -18,
    rpp_along_remaining_mm: 210,
    ...overrides,
  };
}

describe("px4 telemetry adapter — RPP and live backend ingest", () => {
  test("unwraps wrapped telemetry bodies without dropping timestamps", () => {
    const unwrapped = unwrapTelemetryPayload({
      generated_at: "2026-09-10T12:00:00.000Z",
      data: {
        lat: 25.1,
        lon: 55.2,
        rpp_state: 4,
        rpp_state_name: "FOLLOWING",
      },
    });

    expect(isPx4Payload(unwrapped)).toBe(true);
    expect(unwrapped).toMatchObject({
      lat: 25.1,
      lon: 55.2,
      rpp_state: 4,
      generated_at: "2026-09-10T12:00:00.000Z",
    });
  });

  test("leaves an already-flat PX4 payload unchanged", () => {
    const payload = { lat: 25.1, lon: 55.2, battery_pct: 80 };
    expect(unwrapTelemetryPayload(payload)).toBe(payload);
  });

  test("recognizes nested rpp objects as live PX4 payloads", () => {
    expect(
      isPx4Payload({
        rpp: { state: 3, state_name: "ALIGNING" },
      }),
    ).toBe(true);
  });

  test("flattens nested rpp and rpp.debug onto the live contract", () => {
    const flattened = flattenRppFields({
      lat: 25.1,
      rpp: {
        state: 4,
        state_name: "FOLLOWING",
        debug: {
          available: true,
          control_mode: "path",
          actual_speed_mps: 0.51,
          cross_track_error_mm: -12.5,
          along_remaining_mm: 180,
          along_position: "BEFORE",
          heading_error_deg: 2.5,
          distance_to_goal_m: 1.8,
        },
      },
    });

    expect(flattened.rpp_state).toBe(4);
    expect(flattened.rpp_state_name).toBe("FOLLOWING");
    expect(flattened.rpp_debug_available).toBe(true);
    expect(flattened.rpp_control_mode).toBe("path");
    expect(flattened.rpp_actual_speed_mps).toBe(0.51);
    expect(flattened.rpp_cross_track_error_mm).toBe(-12.5);
    expect(flattened.rpp_along_remaining_mm).toBe(180);
    expect(flattened.rpp_along_position).toBe("BEFORE");
    expect(flattened.rpp_heading_error_deg).toBe(2.5);
    expect(flattened.rpp_distance_to_goal_m).toBe(1.8);
  });

  test("flat rpp fields win over nested aliases", () => {
    const flattened = flattenRppFields({
      rpp_state: 7,
      rpp_state_name: "HOLD",
      rpp_actual_speed_mps: 0.2,
      rpp: {
        state: 1,
        state_name: "IDLE",
        actual_speed_mps: 9,
      },
    });

    expect(flattened.rpp_state).toBe(7);
    expect(flattened.rpp_state_name).toBe("HOLD");
    expect(flattened.rpp_actual_speed_mps).toBe(0.2);
  });

  test("toRoverTelemetry keeps nested RPP values and does not fabricate state 0", () => {
    const adapted = toRoverTelemetry({
      lat: 25.1,
      lon: 55.2,
      rpp: {
        state: 4,
        state_name: "FOLLOWING",
        debug: {
          actual_speed_mps: 0.33,
          cross_track_error_mm: 8,
          along_remaining_mm: 95,
          along_position: "AFTER",
          guidance_bearing_deg: 91.2,
          heading_error_deg: -1.4,
          distance_to_goal_m: 0.95,
        },
      },
    });

    expect(adapted.mission.rpp_state).toBe(4);
    expect(adapted.rpp_state_name).toBe("FOLLOWING");
    expect(adapted.rpp_debug_available).toBe(true);
    expect(adapted.rpp_actual_speed_mps).toBe(0.33);
    expect(adapted.rpp_cross_track_error_mm).toBe(8);
    expect(adapted.rpp_along_remaining_mm).toBe(95);
    expect(adapted.rpp_along_position).toBe("AFTER");
    expect(adapted.rpp_guidance_bearing_deg).toBe(91.2);
    expect(adapted.rpp_heading_error_deg).toBe(-1.4);
    expect(adapted.rpp_distance_to_goal_m).toBe(0.95);
  });

  test("missing RPP fields stay undefined so later packets cannot wipe live values", () => {
    const adapted = toRoverTelemetry({
      lat: 25.1,
      lon: 55.2,
      battery_pct: 70,
    });

    expect(adapted.mission.rpp_state).toBeUndefined();
    expect(adapted.rpp_state_name).toBeUndefined();
    expect(adapted.rpp_debug_available).toBeUndefined();
    expect(adapted.rpp_actual_speed_mps).toBeUndefined();
    expect(adapted.rpp_cross_track_error_mm).toBeUndefined();
    expect(adapted.rpp_along_remaining_mm).toBeUndefined();

    const envelope = toLiveTelemetryEnvelope(adapted, 123);
    expect(envelope.rpp_debug_available).toBeUndefined();
    expect(envelope.rpp_actual_speed_mps).toBeUndefined();
    expect(envelope.mission?.rpp_state).toBeUndefined();
  });

  test("toTelemetryEnvelopeFromRoverData forwards nested RPP debug", () => {
    const envelope = toTelemetryEnvelopeFromRoverData({
      lat: 25.1,
      lon: 55.2,
      rpp: {
        state_name: "FOLLOWING",
        debug: {
          available: true,
          actual_speed_mps: 0.4,
          along_remaining_mm: 120,
        },
      },
    });

    expect(envelope.rpp_state_name).toBe("FOLLOWING");
    expect(envelope.rpp_debug_available).toBe(true);
    expect(envelope.rpp_actual_speed_mps).toBe(0.4);
    expect(envelope.rpp_along_remaining_mm).toBe(120);
  });

  test("mergeMissionStatus preserves live RPP when mission_status omits it", () => {
    const merged = mergeMissionStatus(makeBaseTelemetry(), {
      state: "running",
      dist_to_goal: 1.2,
    });

    expect(merged.mission.rpp_state).toBe(4);
    expect(merged.mission.rpp_state_name).toBe("FOLLOWING");
    expect(merged.rpp_state_name).toBe("FOLLOWING");
    expect(merged.distance_to_next_m).toBe(1.2);
  });

  test("mergeMissionStatus copies a new RPP state from mission_status", () => {
    const merged = mergeMissionStatus(makeBaseTelemetry(), {
      state: "running",
      rpp_state: 6,
      rpp_state_name: "ARRIVED",
    });

    expect(merged.mission.rpp_state).toBe(6);
    expect(merged.rpp_state_name).toBe("ARRIVED");
  });
});
