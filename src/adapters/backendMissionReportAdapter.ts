import type {
  CanonicalMissionReport,
  MissionReportAccuracy,
  MissionReportPointStatus,
} from "../services/missionApi";

import type {
  WaypointUiStatus,
} from "../types/missionWaypointStatus";

export interface MissionReportRowStatus {
  reached: boolean;
  marked: boolean;

  status:
    WaypointUiStatus;

  timestamp?: string;

  remark: string;
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
    return (
      "Along — | "
      + "Cross — | "
      + "Overall —"
    );
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