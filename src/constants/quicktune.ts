/**
 * QuickTune Feature Constants
 *
 * Single source of truth for all magic numbers used across the QuickTune
 * wizard, service layer, and step components.
 */

// ── RC Aux Channel ────────────────────────────────────────────────────────────

/**
 * ArduRover RC aux function number assigned to QuickTune (RTUN_RC_FUNC).
 * Used by DO_AUX_FUNCTION MAVLink commands to start/stop/save the tune.
 * Default ArduRover value: 300.
 */
export const QUICKTUNE_AUX_CHANNEL = 300;

// ── HTTP / Network ────────────────────────────────────────────────────────────

/** Axios request timeout for all QuickTune HTTP calls (ms). */
export const QUICKTUNE_HTTP_TIMEOUT_MS = 10_000;

// ── Timing / Delays ───────────────────────────────────────────────────────────

/** Time to wait after FC reboot before re-checking the script (ms). */
export const FC_REBOOT_WAIT_MS = 15_000;

/** Duration to show apply-success/error badge before clearing it (ms). */
export const PARAM_APPLY_STATUS_CLEAR_MS = 3_000;

/** Interval for the save-gains countdown ticker (ms). */
export const SAVE_COUNTDOWN_TICK_MS = 1_000;

/**
 * Stall detection timeout: if no DONE message arrives within this window
 * the user is warned that tuning may have stalled (ms).
 * Tuning typically takes 5–10 min; 15 min gives a generous buffer.
 */
export const TUNING_STALL_TIMEOUT_MS = 15 * 60 * 1_000;

// ── Vehicle / Telemetry Thresholds ────────────────────────────────────────────

/** Minimum ground speed (m/s) required to confirm the rover is circling. */
export const MIN_CIRCLE_SPEED_MS = 0.1;
