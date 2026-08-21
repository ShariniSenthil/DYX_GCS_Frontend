import type {
  CanonicalMissionReport,
  MissionReportAccuracy,
  MissionReportPointStatus,
} from "../services/missionApi";

import {
  isTerminalWaypointStatus,
  type WaypointUiStatus,
} from "../types/missionWaypointStatus";

export interface MissionReportRowStatus {
  reached: boolean;
  marked: boolean;

  status:
    WaypointUiStatus;

  timestamp?: string;

  remark: string;
}

/**
 * Runtime/event fallback used only to repair a lagging canonical
 * Mission Report row.
 *
 * Intentionally contains NO remark or accuracy fields.
 * GET /api/mission/report remains the only authority for those.
 */
export interface MissionReportFallbackStatus {
  reached?: boolean;
  marked?: boolean;
  status?: WaypointUiStatus;
  timestamp?: string;
}

export interface BackendMissionReportProjection {
  statusMap:
    Record<
      number,
      MissionReportRowStatus
    >;

  activeIndex:
    number | null;
}

const EMPTY_ACCURACY_REMARK =
  "Along — | Cross — | Overall —";

/**
 * Repair the short race where the runtime point snapshot has already
 * reached a terminal state but /api/mission/report is still PENDING
 * or has not emitted that sequence yet.
 *
 * Authority rules:
 *
 * 1. A terminal canonical report row always wins.
 * 2. A terminal runtime row may temporarily replace only a missing
 *    or non-terminal canonical status.
 * 3. Runtime remark / locally calculated accuracy is NEVER copied.
 * 4. Once the next report poll contains the terminal row + RPP
 *    accuracy, that canonical row naturally replaces this fallback.
 */
export function reconcileMissionReportRow(
  reportRow:
    MissionReportRowStatus
    | undefined,
  fallbackRow:
    MissionReportFallbackStatus
    | undefined,
): MissionReportRowStatus | null {
  const reportIsTerminal =
    isTerminalWaypointStatus(
      reportRow?.status,
    );

  const fallbackIsTerminal =
    isTerminalWaypointStatus(
      fallbackRow?.status,
    );

  /*
   * Canonical terminal state is final.
   *
   * Also keep a canonical non-terminal row when there is no
   * authoritative terminal fallback available.
   */
  if (
    reportRow
    && (
      reportIsTerminal
      || !fallbackIsTerminal
    )
  ) {
    return reportRow;
  }

  /*
   * No useful terminal fallback.
   */
  if (
    !fallbackIsTerminal
    || !fallbackRow?.status
  ) {
    return reportRow ?? null;
  }

  const status =
    fallbackRow.status;

  /*
   * Promote terminal STATUS only.
   *
   * Do not spread fallbackRow here:
   * legacy maps can contain local GPS accuracy and remarks.
   */
  return {
    reached:
      status === "completed"
      || status === "failed"
      || fallbackRow.reached === true,

    marked:
      status === "completed"
      || fallbackRow.marked === true,

    status,

    timestamp:
      fallbackRow.timestamp
      ?? reportRow?.timestamp,

    /*
     * Accuracy/remark always remains report-owned.
     * If the report row has not arrived yet, show placeholders
     * until the next canonical poll supplies RPP accuracy.
     */
    remark:
      reportRow?.remark
      ?? EMPTY_ACCURACY_REMARK,
  };
}

function mapStatus(
  status:
    MissionReportPointStatus,
): WaypointUiStatus {
  switch (status) {
    case "COMPLETED":
      return "completed";

    case "FAILED":
      return "failed";

    case "SKIPPED":
      return "skipped";

    case "PENDING":
    default:
      return "pending";
  }
}

function formatSignedMm(
  value:
    number
    | null
    | undefined,
): string {
  if (
    value == null
    || !Number.isFinite(value)
  ) {
    return "—";
  }

  const prefix =
    value > 0
      ? "+"
      : "";

  return (
    `${prefix}${value.toFixed(1)} mm`
  );
}

function formatOverallMm(
  value:
    number
    | null
    | undefined,
): string {
  if (
    value == null
    || !Number.isFinite(value)
  ) {
    return "—";
  }

  return (
    `${value.toFixed(1)} mm`
  );
}

function buildRemark(
  accuracy:
    MissionReportAccuracy
    | null
    | undefined,
): string {

  if (
    !accuracy
    || accuracy.available
    !== true
  ) {
    return EMPTY_ACCURACY_REMARK;
  }

  const along =
    formatSignedMm(
      accuracy
        .along_track_error_mm,
    );

  const cross =
    formatSignedMm(
      accuracy
        .cross_track_error_mm,
    );

  const overall =
    formatOverallMm(
      accuracy
        .overall_accuracy_mm,
    );

  // DISPLAY ONLY.
  // No accuracy calculation happens here.
  return (
    `Along ${along} | `
    + `Cross ${cross} | `
    + `Overall ${overall}`
  );
}

export function projectBackendMissionReport(
  report:
    CanonicalMissionReport
    | null,
): BackendMissionReportProjection | null {

  if (
    !report
    || !Array.isArray(
      report.points
    )
  ) {
    return null;
  }

  const statusMap:
    Record<
      number,
      MissionReportRowStatus
    > = {};

  let activeIndex:
    number | null = null;

  for (
    const point
    of report.points
  ) {
    const sequence =
      Number(
        point.sequence
      );

    if (
      !Number.isInteger(
        sequence
      )
      || sequence <= 0
    ) {
      continue;
    }

    const status =
      mapStatus(
        point.status
      );

    if (
      point.is_active
      === true
    ) {
      activeIndex =
        point.point_index;
    }

    statusMap[
      sequence
    ] = {
      reached:
        status
        === "completed"
        || status
        === "failed",

      marked:
        status
        === "completed",

      status,

      timestamp:
        point.updated_at
        ?? point.accuracy
          ?.captured_at
        ?? undefined,

      remark:
        buildRemark(
          point.accuracy
        ),
    };
  }

  return {
    statusMap,
    activeIndex,
  };
}