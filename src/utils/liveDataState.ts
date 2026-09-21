/**
 * Presentation state for values originating from rover telemetry.
 *
 * This deliberately describes what the operator can trust, rather than
 * changing the raw value. Navigation and mission decisions must continue to
 * use the unmodified backend telemetry.
 */
export type LiveDataState =
  | "live"
  | "stale"
  | "waiting"
  | "unavailable"
  | "offline"
  | "inactive";

export function liveDataStateLabel(state: LiveDataState): string {
  switch (state) {
    case "live":
      return "LIVE";
    case "stale":
      return "LIVE DATA STALE";
    case "waiting":
      return "WAITING FOR DATA";
    case "unavailable":
      return "UNAVAILABLE";
    case "offline":
      return "OFFLINE";
    case "inactive":
      return "MISSION NOT ACTIVE";
  }
}
