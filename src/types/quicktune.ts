/**
 * QuickTune Feature Type Definitions
 *
 * Used for the QuickTune wizard flow that guides users through
 * pretune and tuned parameter configuration for robot optimization.
 */

// ============================================================================
// Parameter Constants
// ============================================================================

/**
 * Pretune parameters — baseline settings to verify before tuning.
 * These are real ArduRover 4.5.6 parameters that affect QuickTune behavior.
 */
export const PRETUNE_PARAMS: string[] = [
  'SCR_ENABLE',           // Lua scripting must be enabled (requires reboot)
  'RTUN_ENABLE',          // QuickTune script enable
  'RTUN_AXES',            // Bitmask: 1=Steering, 2=Speed, 3=Both
  'RTUN_RC_FUNC',         // RC aux function number (default 300)
  'RTUN_AUTO_SAVE',       // Auto-save delay in seconds after tune completes
  'RTUN_AUTO_FILTER',     // Auto-set PID filters from INS_GYRO_FILTER
  'RTUN_STR_FFRATIO',     // Steering FF ratio
  'RTUN_STR_P_RATIO',     // Steering FF→P ratio
  'RTUN_STR_I_RATIO',     // Steering FF→I ratio
  'RTUN_SPD_FFRATIO',     // Speed FF ratio
  'RTUN_SPD_P_RATIO',     // Speed FF→P ratio
  'RTUN_SPD_I_RATIO',     // Speed FF→I ratio
  'CIRC_SPEED',           // Circle mode speed (m/s)
  'CIRC_RADIUS',          // Circle mode radius (m)
  'CIRC_DIR',             // Circle mode direction
  'ATC_STR_ACC_MAX',      // Steering acceleration max (deg/s/s)
  'ATC_STR_RAT_MAX',      // Steering rate max (deg/s)
  'ATC_BRAKE',            // Brake enable
];

/**
 * Tuned parameters — the params the Lua script actually modifies during tuning.
 * These are snapshotted before tuning and compared after for the results table.
 *
 * From rover-quicktune.lua: axis_names × param_suffixes + params_extra
 */
export const TUNED_PARAMS: string[] = [
  'ATC_STR_RAT_FF',      // Steering feed-forward (primary output)
  'ATC_STR_RAT_P',       // Steering P (set to ratio of FF)
  'ATC_STR_RAT_I',       // Steering I (set to ratio of FF)
  'ATC_STR_RAT_D',       // Steering D
  'ATC_STR_RAT_FLTT',    // Steering target filter (auto-set from INS_GYRO_FILTER)
  'ATC_STR_RAT_FLTD',    // Steering derivative filter (auto-set from INS_GYRO_FILTER)
  'ATC_SPEED_P',          // Speed P (set to ratio of FF equivalent)
  'ATC_SPEED_I',          // Speed I (set to ratio of FF equivalent)
  'ATC_SPEED_D',          // Speed D
  'CRUISE_SPEED',         // Cruise speed (calculated from FF tuning)
  'CRUISE_THROTTLE',      // Cruise throttle (calculated from FF tuning)
];

// ============================================================================
// Wizard Step & State Types
// ============================================================================

/**
 * Wizard step identifiers
 */
export enum WizardStep {
  Overview = 'overview',
  PretuneCheck = 'pretune_check',
  ApplyPretune = 'apply_pretune',
  RunTuning = 'run_tuning',
  ApplyTuned = 'apply_tuned',
  Complete = 'complete',
}

/**
 * Tune state machine states
 */
export enum TuneState {
  Idle = 'idle',
  Checking = 'checking',
  ApplyingPretune = 'applying_pretune',
  Tuning = 'tuning',
  ApplyingTuned = 'applying_tuned',
  Success = 'success',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

// ============================================================================
// Core Types
// ============================================================================

/**
 * QuickTune parameter with metadata
 */
export interface QuickTuneParam {
  name: string;
  currentValue: number;
  recommendedValue: number;
  min: number;
  max: number;
  units?: string;
  description?: string;
}

/**
 * Script check result from validation phase
 */
export interface ScriptCheckResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
  paramSnapshots: ParamSnapshot[];
}

/**
 * Parameter snapshot for before/after comparison
 */
export interface ParamSnapshot {
  name: string;
  before: number;
  after?: number;
}

/**
 * Auxiliary function payload for tuning operations
 */
export interface AuxFunctionPayload {
  functionName: string;
  params: Record<string, unknown>;
  timeoutMs?: number;
}

/**
 * QuickTune log entry for audit trail
 */
export interface QuickTuneLogEntry {
  timestamp: string;
  step: WizardStep;
  state: TuneState;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Tune result after completion
 */
export interface TuneResult {
  success: boolean;
  durationMs: number;
  appliedParams: Record<string, number>;
  previousParams: Record<string, number>;
  logs: QuickTuneLogEntry[];
  error?: string;
}

/**
 * Wizard shared state persisted across steps
 */
export interface WizardSharedState {
  currentStep: WizardStep;
  tuneState: TuneState;
  pretuneParams: Record<string, number>;
  tunedParams: Record<string, number>;
  checkResult: ScriptCheckResult | null;
  tuneResult: TuneResult | null;
  logs: QuickTuneLogEntry[];
  startedAt?: string;
  completedAt?: string;
}
