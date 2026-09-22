/**
 * Live row model for the Mission Marking Points table.
 *
 * LegendList with recycleItems only re-renders a visible cell when
 * `data[i]` identity or `extraData` / `dataVersion` changes. Waypoint
 * objects stay the same for the whole mission, so status/RPP/survey
 * must be folded into the row model and a content revision.
 */

export type MarkingPointSurvey = {
  available?: boolean;
  radial_error_mm?: number | null;
  reason?: string | null;
} | null;

export type MarkingPointStatus = {
  status?: string;
  timestamp?: string;
  remark?: string;
  survey?: MarkingPointSurvey;
};

export type MarkingPointWaypoint = {
  sn: number;
  lat?: number;
  lon?: number;
  block?: unknown;
  row?: unknown;
  pile?: unknown;
};

export type MarkingPointRow<TWaypoint extends MarkingPointWaypoint = MarkingPointWaypoint> =
  {
    waypoint: TWaypoint;
    index: number;
    wpStatus: MarkingPointStatus | undefined;
    isCurrentWaypoint: boolean;
    revision: string;
  };

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function markingPointStatusRevision(
  wpStatus: MarkingPointStatus | null | undefined,
): string {
  const survey = wpStatus?.survey;
  const radial = finiteNumber(survey?.radial_error_mm);

  return [
    String(wpStatus?.status ?? ""),
    String(wpStatus?.timestamp ?? ""),
    String(wpStatus?.remark ?? ""),
    survey?.available === true ? "1" : "0",
    radial === null ? "" : String(radial),
    String(survey?.reason ?? ""),
  ].join("|");
}

export function markingPointWaypointRevision(
  waypoint: MarkingPointWaypoint,
): string {
  return [
    String(waypoint.sn),
    String(waypoint.lat ?? ""),
    String(waypoint.lon ?? ""),
    String(waypoint.block ?? ""),
    String(waypoint.row ?? ""),
    String(waypoint.pile ?? ""),
  ].join("|");
}

export function markingPointRowRevision(
  waypoint: MarkingPointWaypoint,
  wpStatus: MarkingPointStatus | null | undefined,
  isCurrentWaypoint: boolean,
): string {
  return [
    isCurrentWaypoint ? "1" : "0",
    markingPointWaypointRevision(waypoint),
    markingPointStatusRevision(wpStatus),
  ].join(":");
}

export function buildMarkingPointRows<TWaypoint extends MarkingPointWaypoint>(
  waypoints: readonly TWaypoint[],
  statusMap: Record<number, MarkingPointStatus | undefined> | null | undefined,
  currentWaypointNumber: number | null,
): MarkingPointRow<TWaypoint>[] {
  const map = statusMap ?? {};

  return waypoints.map((waypoint, index) => {
    const wpStatus = map[waypoint.sn];
    const isCurrentWaypoint =
      currentWaypointNumber !== null && waypoint.sn === currentWaypointNumber;

    return {
      waypoint,
      index,
      wpStatus,
      isCurrentWaypoint,
      revision: markingPointRowRevision(
        waypoint,
        wpStatus,
        isCurrentWaypoint,
      ),
    };
  });
}

export function buildMarkingPointListRevision(
  waypoints: readonly MarkingPointWaypoint[],
  statusMap: Record<number, MarkingPointStatus | undefined> | null | undefined,
  currentWaypointNumber: number | null,
): string {
  const parts = [
    `c:${currentWaypointNumber ?? ""}`,
    `n:${waypoints.length}`,
  ];

  for (const waypoint of waypoints) {
    const isCurrentWaypoint =
      currentWaypointNumber !== null && waypoint.sn === currentWaypointNumber;

    parts.push(
      `${waypoint.sn}:${markingPointRowRevision(
        waypoint,
        statusMap?.[waypoint.sn],
        isCurrentWaypoint,
      )}`,
    );
  }

  return parts.join(";");
}

type SharableRow = MarkingPointStatus & {
  reached?: boolean;
  marked?: boolean;
};

function sameRow(a: SharableRow | undefined, b: SharableRow | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    markingPointStatusRevision(a) === markingPointStatusRevision(b) &&
    a.reached === b.reached &&
    a.marked === b.marked &&
    // Export reads the whole survey object, not just the revisioned fields.
    JSON.stringify(a.survey ?? null) === JSON.stringify(b.survey ?? null)
  );
}

/**
 * Structural sharing for the mission table status map.
 *
 * Reuses the previous row object for every point whose displayed content is
 * unchanged, and returns `previous` itself when no row changed. A point event
 * for P0025 therefore changes exactly one row object, and a rebuild that
 * changes nothing does not invalidate the table at all.
 */
export function shareUnchangedRows<T extends SharableRow>(
  previous: Record<number, T> | null | undefined,
  next: Record<number, T>,
): Record<number, T> {
  if (!previous) return next;
  const nextKeys = Object.keys(next);
  let changed = nextKeys.length !== Object.keys(previous).length;
  const shared: Record<number, T> = {};
  for (const key of nextKeys) {
    const index = Number(key);
    const before = previous[index];
    const after = next[index];
    if (before !== undefined && sameRow(before, after)) {
      shared[index] = before;
    } else {
      shared[index] = after;
      changed = true;
    }
  }
  return changed ? shared : previous;
}
