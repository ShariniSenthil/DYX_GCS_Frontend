import type { RoverTelemetry } from "../types/telemetry";

export const EMPTY_RPP_ACCURACY_REMARK =
  "Along — | Cross — | Overall —";

export interface TerminalRppAccuracySnapshot {
  pointIndex: number;

  alongTrackErrorMm: number;
  crossTrackErrorMm: number;
  overallAccuracyMm: number;

  capturedAt: string;
}

function finiteNumber(
  value: unknown,
): number | null {
  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : null;
}

function firstFinite(
  ...values: unknown[]
): number | null {
  for (const value of values) {
    const numberValue =
      finiteNumber(value);

    if (numberValue !== null) {
      return numberValue;
    }
  }

  return null;
}

/**
 * Only COMPLETED and FAILED points have a meaningful
 * terminal RPP placement measurement.
 *
 * SKIPPED / PENDING must not fabricate accuracy.
 */
export function isTerminalRppAccuracyStatus(
  status: unknown,
): boolean {
  return (
    status === "completed"
    || status === "failed"
  );
}

/**
 * Freeze the latest RPP accuracy for one marking point.
 *
 * This is a TEMPORARY frontend fallback for the race where
 * point status becomes terminal before /api/mission/report
 * publishes its terminal accuracy.
 *
 * It does NOT calculate accuracy.
 * It only copies values already calculated by RPP/backend.
 */
export function captureTerminalRppAccuracy(
  telemetry: RoverTelemetry,
  pointIndex: number,
  capturedAt = new Date().toISOString(),
  options?: {
    ignoreIdentity?: boolean;
    allowUnavailable?: boolean;
  },
): TerminalRppAccuracySnapshot | null {
  if (
    !Number.isInteger(pointIndex)
    || pointIndex < 0
  ) {
    return null;
  }

  const available =
    telemetry.accuracy_available === true
    || telemetry.accuracy?.available === true;

  if (!available && !options?.allowUnavailable) {
    return null;
  }

  /*
   * Verify that the accuracy belongs to the point
   * that just became terminal.
   *
   * Backend point_index is zero-based.
   * goal_number / active_point_number are one-based.
   */
  const expectedPointNumber =
    pointIndex + 1;

  const goalNumber =
    finiteNumber(
      telemetry.accuracy?.goal_number,
    );

  const activePointIndex =
    finiteNumber(
      telemetry.mission?.active_point_index,
    );

  const activePointNumber =
    finiteNumber(
      telemetry.mission?.active_point_number,
    );

  const hasPointIdentity =
    goalNumber !== null
    || activePointIndex !== null
    || activePointNumber !== null;

  const identityMatches =
    (
      goalNumber !== null
      && Math.trunc(goalNumber)
        === expectedPointNumber
    )
    || (
      activePointIndex !== null
      && Math.trunc(activePointIndex)
        === pointIndex
    )
    || (
      activePointNumber !== null
      && Math.trunc(activePointNumber)
        === expectedPointNumber
    );

  if (
    hasPointIdentity
    && !identityMatches
    && !options?.ignoreIdentity
  ) {
    return null;
  }

  const alongTrackErrorMm =
    firstFinite(
      telemetry.front_back_error_mm,
      telemetry.accuracy
        ?.front_back_error_mm,
    );

  const crossTrackErrorMm =
    firstFinite(
      telemetry.cross_track_error_mm,
      telemetry.accuracy
        ?.cross_track_error_mm,
    );

  const overallAccuracyMm =
    firstFinite(
      telemetry.radial_error_mm,
      telemetry.accuracy
        ?.radial_error_mm,
    );

  if (
    alongTrackErrorMm === null
    || crossTrackErrorMm === null
    || overallAccuracyMm === null
  ) {
    return null;
  }

  return {
    pointIndex,

    alongTrackErrorMm,
    crossTrackErrorMm,
    overallAccuracyMm,

    capturedAt,
  };
}

function formatSignedMm(
  value: number,
): string {
  const prefix =
    value > 0
      ? "+"
      : "";

  return (
    `${prefix}${value.toFixed(1)} mm`
  );
}

function formatOverallMm(
  value: number,
): string {
  return `${value.toFixed(1)} mm`;
}

export function formatTerminalRppAccuracy(
  snapshot:
    TerminalRppAccuracySnapshot,
): string {
  return (
    `Along ${formatSignedMm(
      snapshot.alongTrackErrorMm,
    )} | `
    + `Cross ${formatSignedMm(
      snapshot.crossTrackErrorMm,
    )} | `
    + `Overall ${formatOverallMm(
      snapshot.overallAccuracyMm,
    )}`
  );
}

/**
 * Canonical report always has priority.
 *
 * The frozen telemetry snapshot is used only while
 * canonical accuracy is still unavailable.
 */
export function selectMissionReportRemark(
  canonicalRemark:
    string
    | undefined
    | null,
  fallback:
    TerminalRppAccuracySnapshot
    | undefined,
): string {
  const canonical =
    canonicalRemark?.trim() ?? "";

  if (
    canonical
    && canonical
      !== EMPTY_RPP_ACCURACY_REMARK
  ) {
    return canonical;
  }

  if (fallback) {
    return formatTerminalRppAccuracy(
      fallback,
    );
  }

  return (
    canonical
    || EMPTY_RPP_ACCURACY_REMARK
  );
}