/**
 * Pure helpers for the RTK profile editor.
 *
 * Password whitespace is preserved. Blank edit password is omitted from PATCH.
 * TLS defaults to REQUIRED. DISABLED requires an explicit operator warning.
 */

import {
  RTK_PROFILE_CREATE_DEFAULTS,
  type RtkProfile,
  type RtkProfileCreateRequest,
  type RtkProfileUpdateRequest,
  type RtkTlsMode,
} from "../types/rtk";
import { isRuntimeSignificantProfileChange } from "./rtkControlAdapter";

export interface RtkProfileEditorForm {
  name: string;
  caster_host: string;
  caster_port: string;
  mountpoint: string;
  username: string;
  password: string;
  tls_mode: RtkTlsMode;
  enabled: boolean;
  gga_enabled: boolean;
  gga_interval_sec: string;
  gga_max_age_sec: string;
  connect_timeout_sec: string;
  socket_timeout_sec: string;
  healthy_age_sec: string;
  stale_reconnect_sec: string;
  reconnect_delay_sec: string;
  first_data_timeout_sec: string;
  max_mavros_rtcm_frame_bytes: string;
}

export const EMPTY_RTK_PROFILE_FORM: RtkProfileEditorForm = {
  name: "",
  caster_host: "",
  caster_port: "2101",
  mountpoint: "",
  username: "",
  password: "",
  tls_mode: "REQUIRED",
  enabled: true,
  gga_enabled: false,
  gga_interval_sec: String(RTK_PROFILE_CREATE_DEFAULTS.gga_interval_sec),
  gga_max_age_sec: String(RTK_PROFILE_CREATE_DEFAULTS.gga_max_age_sec),
  connect_timeout_sec: String(RTK_PROFILE_CREATE_DEFAULTS.connect_timeout_sec),
  socket_timeout_sec: String(RTK_PROFILE_CREATE_DEFAULTS.socket_timeout_sec),
  healthy_age_sec: String(RTK_PROFILE_CREATE_DEFAULTS.healthy_age_sec),
  stale_reconnect_sec: String(RTK_PROFILE_CREATE_DEFAULTS.stale_reconnect_sec),
  reconnect_delay_sec: String(RTK_PROFILE_CREATE_DEFAULTS.reconnect_delay_sec),
  first_data_timeout_sec: String(RTK_PROFILE_CREATE_DEFAULTS.first_data_timeout_sec),
  max_mavros_rtcm_frame_bytes: String(
    RTK_PROFILE_CREATE_DEFAULTS.max_mavros_rtcm_frame_bytes,
  ),
};

export function profileToEditorForm(profile: RtkProfile): RtkProfileEditorForm {
  return {
    name: String(profile.name ?? ""),
    caster_host: String(profile.caster_host ?? ""),
    caster_port: String(profile.caster_port ?? ""),
    mountpoint: String(profile.mountpoint ?? ""),
    username: String(profile.username ?? ""),
    password: "",
    tls_mode: profile.tls_mode === "DISABLED" ? "DISABLED" : "REQUIRED",
    enabled: Boolean(profile.enabled),
    gga_enabled: Boolean(profile.gga_enabled),
    gga_interval_sec: String(profile.gga_interval_sec ?? ""),
    gga_max_age_sec: String(profile.gga_max_age_sec ?? ""),
    connect_timeout_sec: String(profile.connect_timeout_sec ?? ""),
    socket_timeout_sec: String(profile.socket_timeout_sec ?? ""),
    healthy_age_sec: String(profile.healthy_age_sec ?? ""),
    stale_reconnect_sec: String(profile.stale_reconnect_sec ?? ""),
    reconnect_delay_sec: String(profile.reconnect_delay_sec ?? ""),
    first_data_timeout_sec: String(profile.first_data_timeout_sec ?? ""),
    max_mavros_rtcm_frame_bytes: String(profile.max_mavros_rtcm_frame_bytes ?? ""),
  };
}

function parsePort(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return null;
  }
  return port;
}

function parsePositiveNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

export interface RtkProfileFormErrors {
  name?: string;
  caster_host?: string;
  caster_port?: string;
  mountpoint?: string;
  username?: string;
  password?: string;
  gga_interval_sec?: string;
  gga_max_age_sec?: string;
  connect_timeout_sec?: string;
  socket_timeout_sec?: string;
  healthy_age_sec?: string;
  stale_reconnect_sec?: string;
  reconnect_delay_sec?: string;
  first_data_timeout_sec?: string;
  max_mavros_rtcm_frame_bytes?: string;
}

export function validateRtkProfileForm(
  form: RtkProfileEditorForm,
  mode: "create" | "edit",
): RtkProfileFormErrors {
  const errors: RtkProfileFormErrors = {};

  if (!form.name.trim()) {
    errors.name = "Name is required";
  }
  if (!form.caster_host.trim()) {
    errors.caster_host = "Caster host is required";
  }
  if (parsePort(form.caster_port) == null) {
    errors.caster_port = "Port must be 1–65535";
  }
  if (!form.mountpoint.trim()) {
    errors.mountpoint = "Mountpoint is required";
  }
  if (!form.username.trim()) {
    errors.username = "Username is required";
  }
  if (mode === "create" && form.password === "") {
    errors.password = "Password is required";
  }

  const numeric: Array<keyof RtkProfileFormErrors> = [
    "gga_interval_sec",
    "gga_max_age_sec",
    "connect_timeout_sec",
    "socket_timeout_sec",
    "healthy_age_sec",
    "stale_reconnect_sec",
    "reconnect_delay_sec",
    "first_data_timeout_sec",
  ];
  for (const field of numeric) {
    if (parsePositiveNumber(String(form[field as keyof RtkProfileEditorForm])) == null) {
      errors[field] = "Must be greater than 0";
    }
  }
  const maxRtcmFrameBytes = parsePositiveInt(
    form.max_mavros_rtcm_frame_bytes,
  );
  if (maxRtcmFrameBytes == null || maxRtcmFrameBytes > 1029) {
    errors.max_mavros_rtcm_frame_bytes = "Must be an integer 1–1029";
  }

  const healthy = parsePositiveNumber(form.healthy_age_sec);
  const stale = parsePositiveNumber(form.stale_reconnect_sec);
  if (healthy != null && stale != null && stale <= healthy) {
    errors.stale_reconnect_sec = "Must be greater than healthy age";
  }

  return errors;
}

export function buildRtkProfileCreateRequest(
  form: RtkProfileEditorForm,
): RtkProfileCreateRequest {
  return {
    name: form.name.trim(),
    caster_host: form.caster_host.trim(),
    caster_port: parsePort(form.caster_port) ?? 2101,
    mountpoint: form.mountpoint.trim().replace(/^\/+/, ""),
    username: form.username.trim(),
    password: form.password,
    tls_mode: form.tls_mode,
    enabled: form.enabled,
    gga_enabled: form.gga_enabled,
    gga_interval_sec: parsePositiveNumber(form.gga_interval_sec) ?? 10,
    gga_max_age_sec: parsePositiveNumber(form.gga_max_age_sec) ?? 5,
    connect_timeout_sec: parsePositiveNumber(form.connect_timeout_sec) ?? 10,
    socket_timeout_sec: parsePositiveNumber(form.socket_timeout_sec) ?? 1,
    healthy_age_sec: parsePositiveNumber(form.healthy_age_sec) ?? 5,
    stale_reconnect_sec: parsePositiveNumber(form.stale_reconnect_sec) ?? 10,
    reconnect_delay_sec: parsePositiveNumber(form.reconnect_delay_sec) ?? 5,
    first_data_timeout_sec: parsePositiveNumber(form.first_data_timeout_sec) ?? 10,
    max_mavros_rtcm_frame_bytes:
      parsePositiveInt(form.max_mavros_rtcm_frame_bytes) ?? 720,
    rtcm_topic: RTK_PROFILE_CREATE_DEFAULTS.rtcm_topic,
  };
}

export function buildRtkProfileUpdateRequest(
  form: RtkProfileEditorForm,
  original: RtkProfile,
): RtkProfileUpdateRequest {
  const create = buildRtkProfileCreateRequest(form);
  const patch: RtkProfileUpdateRequest = {};

  if (create.name !== original.name) patch.name = create.name;
  if (create.caster_host !== original.caster_host) patch.caster_host = create.caster_host;
  if (create.caster_port !== original.caster_port) patch.caster_port = create.caster_port;
  if (create.mountpoint !== original.mountpoint) patch.mountpoint = create.mountpoint;
  if (create.username !== original.username) patch.username = create.username;
  if (create.tls_mode !== original.tls_mode) patch.tls_mode = create.tls_mode;
  if (create.enabled !== original.enabled) patch.enabled = create.enabled;
  if (create.gga_enabled !== original.gga_enabled) patch.gga_enabled = create.gga_enabled;
  if (create.gga_interval_sec !== original.gga_interval_sec) {
    patch.gga_interval_sec = create.gga_interval_sec;
  }
  if (create.gga_max_age_sec !== original.gga_max_age_sec) {
    patch.gga_max_age_sec = create.gga_max_age_sec;
  }
  if (create.connect_timeout_sec !== original.connect_timeout_sec) {
    patch.connect_timeout_sec = create.connect_timeout_sec;
  }
  if (create.socket_timeout_sec !== original.socket_timeout_sec) {
    patch.socket_timeout_sec = create.socket_timeout_sec;
  }
  if (create.healthy_age_sec !== original.healthy_age_sec) {
    patch.healthy_age_sec = create.healthy_age_sec;
  }
  if (create.stale_reconnect_sec !== original.stale_reconnect_sec) {
    patch.stale_reconnect_sec = create.stale_reconnect_sec;
  }
  if (create.reconnect_delay_sec !== original.reconnect_delay_sec) {
    patch.reconnect_delay_sec = create.reconnect_delay_sec;
  }
  if (create.first_data_timeout_sec !== original.first_data_timeout_sec) {
    patch.first_data_timeout_sec = create.first_data_timeout_sec;
  }
  if (create.max_mavros_rtcm_frame_bytes !== original.max_mavros_rtcm_frame_bytes) {
    patch.max_mavros_rtcm_frame_bytes = create.max_mavros_rtcm_frame_bytes;
  }

  if (form.password !== "") {
    patch.password = form.password;
  }

  return patch;
}

export function editorNeedsTlsDisabledConfirmation(
  nextMode: RtkTlsMode,
  previousMode?: RtkTlsMode,
): boolean {
  return nextMode === "DISABLED" && previousMode !== "DISABLED";
}

export function editorWarnsForcedStop(
  patch: RtkProfileUpdateRequest,
  original: RtkProfile,
  activeProfileId: number | null,
  desiredState: "STOPPED" | "RUNNING" | null,
): boolean {
  if (original.id !== activeProfileId) {
    return false;
  }
  if (desiredState !== "RUNNING") {
    return false;
  }
  return isRuntimeSignificantProfileChange(patch as Record<string, unknown>);
}
