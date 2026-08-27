/**
 * Pure mapping from GET /api/rtk/status to a deterministic RTK UI view.
 *
 * This adapter never makes network requests. A successful POST /api/rtk/start
 * is not an input and must never be treated as RTK Fixed / corrections healthy.
 *
 * Correction-stream health is independent from GNSS solution state.
 */

import type {
  RtkCorrectionStream,
  RtkDesiredState,
  RtkErrorReason,
  RtkGnssSolution,
  RtkGgaTelemetry,
  RtkManagerState,
  RtkProfile,
  RtkStatus,
  RtkStatusResponse,
} from "../types/rtk";

export type RtkHeadlineState =
  | "rover_offline"
  | "off"
  | "start_requested"
  | "waiting_for_mavros"
  | "starting"
  | "rtk_fixed"
  | "rtk_float"
  | "corrections_active"
  | "degraded"
  | "mavros_lost"
  | "reconnecting"
  | "stopping"
  | "terminal_error";

export type RtkHeadlineTone =
  | "idle"
  | "healthy"
  | "transitional"
  | "degraded"
  | "terminal";

export const RTK_HEADLINE_LABEL: Record<RtkHeadlineState, string> = {
  rover_offline: "Rover Offline",
  off: "Off",
  start_requested: "Start Requested",
  waiting_for_mavros: "Waiting for MAVROS",
  starting: "Starting",
  rtk_fixed: "RTK Fixed",
  rtk_float: "RTK Float",
  corrections_active: "Corrections Active",
  degraded: "Degraded",
  mavros_lost: "MAVROS Lost",
  reconnecting: "Reconnecting",
  stopping: "Stopping",
  terminal_error: "Terminal Error",
};

export interface RtkControlViewModel {
  headline: RtkHeadlineState;
  headlineLabel: string;
  tone: RtkHeadlineTone;
  desiredState: RtkDesiredState | null;
  managerState: RtkManagerState | null;
  supervisorRunning: boolean | null;
  mavrosReady: boolean | null;
  errorReason: RtkErrorReason | null;
  correctionState: string | null;
  correctionConnected: boolean;
  correctionHealthy: boolean;
  correctionAgeSec: number | null;
  publishedFrames: number | null;
  socketBytesReceived: number | null;
  gnssFixType: number | null;
  gnssFixName: string | null;
  rtkFloat: boolean;
  rtkFixed: boolean;
  satellitesVisible: number | null;
  ggaEnabled: boolean;
  ggaState: string | null;
  activeProfile: RtkProfile | null;
  activeProfileId: number | null;
  canStart: boolean;
  canStop: boolean;
  canEdit: boolean;
  canDelete: boolean;
  disabledReason: string | null;
}

export interface RtkControlViewOptions {
  connected?: boolean;
  mutationBusy?: boolean;
}

const IDLE_VIEW: RtkControlViewModel = {
  headline: "rover_offline",
  headlineLabel: RTK_HEADLINE_LABEL.rover_offline,
  tone: "terminal",
  desiredState: null,
  managerState: null,
  supervisorRunning: null,
  mavrosReady: null,
  errorReason: null,
  correctionState: null,
  correctionConnected: false,
  correctionHealthy: false,
  correctionAgeSec: null,
  publishedFrames: null,
  socketBytesReceived: null,
  gnssFixType: null,
  gnssFixName: null,
  rtkFloat: false,
  rtkFixed: false,
  satellitesVisible: null,
  ggaEnabled: false,
  ggaState: null,
  activeProfile: null,
  activeProfileId: null,
  canStart: false,
  canStop: false,
  canEdit: false,
  canDelete: false,
  disabledReason: "Rover Offline",
};

export function unwrapRtkStatus(
  input: RtkStatusResponse | RtkStatus | null | undefined,
): RtkStatus | null {
  if (!input) {
    return null;
  }
  if ("status" in input && input.status && typeof input.status === "object") {
    return input.status;
  }
  if ("persisted" in input && "runtime" in input) {
    return input as RtkStatus;
  }
  return null;
}

function toneForHeadline(headline: RtkHeadlineState): RtkHeadlineTone {
  switch (headline) {
    case "rtk_fixed":
    case "rtk_float":
    case "corrections_active":
      return "healthy";
    case "start_requested":
    case "waiting_for_mavros":
    case "starting":
    case "reconnecting":
    case "stopping":
      return "transitional";
    case "degraded":
    case "mavros_lost":
      return "degraded";
    case "terminal_error":
    case "rover_offline":
      return "terminal";
    case "off":
    default:
      return "idle";
  }
}

function runningHeadline(
  correctionHealthy: boolean,
  gnss: RtkGnssSolution | undefined,
): RtkHeadlineState {
  const fixType = gnss?.fix_type ?? 0;
  if (correctionHealthy && (gnss?.rtk_fixed === true || fixType === 6)) {
    return "rtk_fixed";
  }
  if (correctionHealthy && (gnss?.rtk_float === true || fixType === 5)) {
    return "rtk_float";
  }
  if (correctionHealthy) {
    return "corrections_active";
  }
  return "degraded";
}

export function deriveRtkHeadline(status: RtkStatus): RtkHeadlineState {
  const desired = status.persisted.desired_state;
  const managerState = status.runtime.manager?.state ?? null;
  const correctionHealthy = Boolean(status.correction_stream?.healthy);
  const gnss = status.gnss_solution;

  if (managerState === "STOPPING") {
    return "stopping";
  }

  if (managerState === "ERROR") {
    return "terminal_error";
  }

  if (desired === "STOPPED" && (managerState === null || managerState === "STOPPED")) {
    return "off";
  }

  if (managerState === "WAITING_FOR_MAVROS") {
    return "waiting_for_mavros";
  }

  if (managerState === "STARTING") {
    return "starting";
  }

  if (managerState === "RUNNING") {
    return runningHeadline(correctionHealthy, gnss);
  }

  if (managerState === "RUNNING_MAVROS_STALE") {
    return "mavros_lost";
  }

  if (managerState === "BACKOFF") {
    return "reconnecting";
  }

  if (desired === "STOPPED") {
    return "off";
  }

  if (desired === "RUNNING" && (managerState === null || managerState === "STOPPED")) {
    return "start_requested";
  }

  return "starting";
}

function deriveDisabledReason(args: {
  connected: boolean;
  mutationBusy: boolean;
  headline: RtkHeadlineState;
  canStart: boolean;
  canStop: boolean;
  activeProfile: RtkProfile | null;
  activeEnabled: boolean;
}): string | null {
  if (!args.connected) {
    return "Rover Offline";
  }
  if (args.mutationBusy) {
    return "RTK command in progress";
  }
  if (args.headline === "terminal_error") {
    return "Terminal RTK error — Stop to reset";
  }
  if (!args.canStart && !args.canStop) {
    if (!args.activeProfile) {
      return "Activate a backend RTK profile before starting";
    }
    if (!args.activeEnabled) {
      return "Active RTK profile is disabled";
    }
  }
  return null;
}

export function toRtkControlView(
  input: RtkStatusResponse | RtkStatus | null | undefined,
  options: RtkControlViewOptions = {},
): RtkControlViewModel {
  const connected = options.connected !== false;
  const mutationBusy = Boolean(options.mutationBusy);

  if (!connected) {
    return {
      ...IDLE_VIEW,
      headline: "rover_offline",
      headlineLabel: RTK_HEADLINE_LABEL.rover_offline,
      tone: "terminal",
      canStart: false,
      canStop: false,
      canEdit: false,
      canDelete: false,
      disabledReason: "Rover Offline",
    };
  }

  const status = unwrapRtkStatus(input);
  if (!status) {
    return {
      ...IDLE_VIEW,
      headline: "off",
      headlineLabel: RTK_HEADLINE_LABEL.off,
      tone: "idle",
      canEdit: !mutationBusy,
      canDelete: false,
      disabledReason: mutationBusy
        ? "RTK command in progress"
        : "No RTK status yet",
    };
  }

  const headline = deriveRtkHeadline(status);
  const stream: RtkCorrectionStream | undefined = status.correction_stream;
  const gnss: RtkGnssSolution | undefined = status.gnss_solution;
  const gga: RtkGgaTelemetry | undefined = stream?.gga;
  const managerState = status.runtime.manager?.state ?? null;
  const desired = status.persisted.desired_state;
  const activeProfile = status.active_profile;
  const activeEnabled = Boolean(activeProfile?.enabled);
  const hasActiveProfile =
    activeProfile != null && status.persisted.active_profile_id != null;

  const canStart =
    !mutationBusy &&
    hasActiveProfile &&
    activeEnabled &&
    desired === "STOPPED" &&
    managerState !== "STOPPING" &&
    managerState !== "ERROR";

  const canStop =
    !mutationBusy &&
    (desired === "RUNNING" ||
      (managerState != null &&
        managerState !== "STOPPED" &&
        managerState !== "ERROR") ||
      managerState === "ERROR");

  const canEdit = !mutationBusy;
  const canDelete = !mutationBusy;

  return {
    headline,
    headlineLabel: RTK_HEADLINE_LABEL[headline],
    tone: toneForHeadline(headline),
    desiredState: desired,
    managerState,
    supervisorRunning: status.runtime.supervisor?.running ?? null,
    mavrosReady:
      status.runtime.manager?.mavros_ready ??
      status.runtime.supervisor?.mavros_ready ??
      stream?.mavros_ready ??
      null,
    errorReason: status.runtime.manager?.error_reason ?? null,
    correctionState: stream?.state ?? null,
    correctionConnected: Boolean(stream?.connected),
    correctionHealthy: Boolean(stream?.healthy),
    correctionAgeSec:
      typeof stream?.correction_age_sec === "number"
        ? stream.correction_age_sec
        : null,
    publishedFrames:
      typeof stream?.published_frames === "number"
        ? stream.published_frames
        : null,
    socketBytesReceived:
      typeof stream?.socket_bytes_received === "number"
        ? stream.socket_bytes_received
        : null,
    gnssFixType: typeof gnss?.fix_type === "number" ? gnss.fix_type : null,
    gnssFixName: gnss?.fix_name ?? null,
    rtkFloat: Boolean(gnss?.rtk_float) || gnss?.fix_type === 5,
    rtkFixed: Boolean(gnss?.rtk_fixed) || gnss?.fix_type === 6,
    satellitesVisible:
      typeof gnss?.satellites_visible === "number"
        ? gnss.satellites_visible
        : null,
    ggaEnabled: Boolean(gga?.enabled),
    ggaState: gga?.state ?? null,
    activeProfile,
    activeProfileId: status.persisted.active_profile_id,
    canStart,
    canStop,
    canEdit,
    canDelete,
    disabledReason: deriveDisabledReason({
      connected,
      mutationBusy,
      headline,
      canStart,
      canStop,
      activeProfile,
      activeEnabled,
    }),
  };
}

export function isRuntimeSignificantProfileChange(
  patch: Record<string, unknown>,
): boolean {
  const keys = [
    "caster_host",
    "caster_port",
    "mountpoint",
    "username",
    "password",
    "rtcm_topic",
    "connect_timeout_sec",
    "socket_timeout_sec",
    "healthy_age_sec",
    "stale_reconnect_sec",
    "reconnect_delay_sec",
    "first_data_timeout_sec",
    "gga_enabled",
    "gga_interval_sec",
    "gga_max_age_sec",
    "tls_mode",
    "max_mavros_rtcm_frame_bytes",
    "enabled",
  ];
  return keys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
}

export function decideMissionRtkQuickStart(args: {
  connected: boolean;
  activeProfileId: number | null | undefined;
}): "offline" | "open_config" | "start" {
  if (!args.connected) {
    return "offline";
  }
  if (args.activeProfileId == null) {
    return "open_config";
  }
  return "start";
}
