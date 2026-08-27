/**
 * Compact RTK icon vocabulary derived from GET /api/rtk/status.
 *
 * Header icons keep a small discrete set. The shared RTK control screen uses
 * `rtkControlAdapter` for the full nested correction/GNSS/manager mapping.
 *
 * Healthy corrections are never collapsed into RTK Fixed.
 */

import type { RtkStatus, RtkStatusResponse } from "../types/rtk";
import {
  toRtkControlView,
  type RtkHeadlineState,
} from "./rtkControlAdapter";

export type RtkUiState =
  | "off"
  | "starting"
  | "streaming"
  | "rtk_float"
  | "rtk_fixed"
  | "error";

export const RTK_UI_STATE_LABEL: Record<RtkUiState, string> = {
  off: "Off",
  starting: "Starting",
  streaming: "Streaming",
  rtk_float: "RTK Float",
  rtk_fixed: "RTK Fixed",
  error: "Error",
};

export function rtkUiStateLabel(
  state: RtkUiState | undefined | null,
): string {
  return state ? RTK_UI_STATE_LABEL[state] ?? state : RTK_UI_STATE_LABEL.off;
}

function headlineToIconState(headline: RtkHeadlineState): RtkUiState {
  switch (headline) {
    case "rtk_fixed":
      return "rtk_fixed";
    case "rtk_float":
      return "rtk_float";
    case "corrections_active":
      return "streaming";
    case "start_requested":
    case "waiting_for_mavros":
    case "starting":
    case "reconnecting":
    case "stopping":
      return "starting";
    case "degraded":
    case "mavros_lost":
    case "terminal_error":
    case "rover_offline":
      return "error";
    case "off":
    default:
      return "off";
  }
}

export function toRtkUiState(
  status: RtkStatusResponse | RtkStatus | null | undefined,
): RtkUiState {
  if (!status) {
    return "off";
  }
  return headlineToIconState(toRtkControlView(status).headline);
}
