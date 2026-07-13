/**
 * 4WD_SERVER Spray-Mode types — mirrors of server sidecar models.
 *
 * Backend routes: PUT /api/path/{name}/spray-mode/{continuous|dash|point}
 */

// ── Spray mode enum ───────────────────────────────────────────────────────────

export type SprayModeType = 'continuous' | 'dash' | 'point';

// ── Request models ────────────────────────────────────────────────────────────

export interface ContinuousModeRequest {
  /** How long spray is on per activation cycle (seconds). Optional. */
  spray_on_duration_s?: number;
  /** Minimum gap between activations (seconds). Optional. */
  spray_off_gap_s?: number;
}

export interface DashModeRequest {
  /** Spray-on run length in meters. */
  dash_on_run_m: number;
  /** Gap (spray-off) between dash runs in meters. */
  dash_off_gap_m: number;
  /** Optional speed override for dash segments (m/s). */
  dash_speed_m_s?: number;
}

export interface PointModeRequest {
  /** Dwell time at point before marking (seconds). */
  dwell_s?: number;
  /** Whether to mark automatically on arrival or wait for operator continue. */
  auto_mark?: boolean;
}

// ── Response model ────────────────────────────────────────────────────────────

export interface SprayModeResponse {
  path_name: string;
  mode: SprayModeType | null;
  config: ContinuousModeRequest | DashModeRequest | PointModeRequest | null;
  /** True if the sidecar has been applied to the loaded mission. */
  applied: boolean;
}
