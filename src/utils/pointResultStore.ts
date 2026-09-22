/**
 * Current-run immutable point results received over Socket.IO.
 *
 * The backend emits one event per Mission Manager point event, in order,
 * carrying `point_result` (contract point_result@1): the exact result it just
 * stored for the canonical report, including RPP_TERMINAL_RESULT accuracy.
 * This store lets one waypoint row update from that event without a REST
 * round trip. It never computes accuracy; it only copies and gates identity.
 *
 * Row authority order (MissionReportScreen):
 *   1. current-run point_result socket event (this store)
 *   2. canonical report
 *   3. placeholder
 */

export interface MissionIdentity {
  missionId: string | null;
  runId: string | null;
}

export interface PointResultEntry {
  missionId: string | null;
  runId: string;
  pointId: string;
  pointIndex: number | null;
  event: string;
  result: Record<string, unknown>;
  receivedAtMs: number;
}

export type PointResultMap = Readonly<Record<string, PointResultEntry>>;

export const EMPTY_POINT_RESULTS: PointResultMap = Object.freeze({});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function finiteInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Parse a backend point event; null unless it carries a usable point_result. */
export function parsePointResultEvent(
  raw: unknown,
  nowMs: number = Date.now(),
): PointResultEntry | null {
  const event = asRecord(raw);
  if (!event) return null;
  const result = asRecord(event.point_result);
  if (!result) return null;

  const pointId = text(result.point_id) ?? text(event.point_id);
  const runId = text(event.mission_run_id) ?? text(result.mission_run_id);
  // A result without run identity can never be proven to belong to the
  // current run, so it is not accepted into the live store.
  if (!pointId || !runId) return null;

  return {
    missionId: text(event.mission_id) ?? text(result.mission_id),
    runId,
    pointId,
    pointIndex: finiteInt(result.point_index ?? event.point_index),
    event: String(event.event ?? result.event ?? "").trim().toUpperCase(),
    result,
    receivedAtMs: nowMs,
  };
}

/** True when the entry provably belongs to a different mission or run. */
export function conflictsWithIdentity(
  entry: Pick<PointResultEntry, "missionId" | "runId">,
  identity: MissionIdentity,
): boolean {
  if (identity.missionId && entry.missionId && identity.missionId !== entry.missionId) {
    return true;
  }
  if (identity.runId && entry.runId !== identity.runId) {
    return true;
  }
  return false;
}

function exactAccuracy(result: Record<string, unknown>): Record<string, unknown> | null {
  const accuracy = asRecord(result.accuracy);
  if (
    accuracy &&
    accuracy.measurement_source === "RPP_TERMINAL_RESULT" &&
    accuracy.available === true
  ) {
    return accuracy;
  }
  return null;
}

/**
 * Apply one event. Returns the same map object when nothing changes, and
 * otherwise a new map in which only `entry.pointId` differs.
 */
export function applyPointResult(
  map: PointResultMap,
  entry: PointResultEntry,
  identity: MissionIdentity,
): PointResultMap {
  if (conflictsWithIdentity(entry, identity)) return map;

  const existing = map[entry.pointId];
  let incoming = entry;

  if (existing && existing.runId === entry.runId) {
    // A later event for the same point (e.g. FAILED emitted without its
    // accuracy) must not erase the exact terminal RPP snapshot already
    // received for it. Preserve -- never compute -- that evidence.
    const previousExact = exactAccuracy(existing.result);
    if (previousExact && !exactAccuracy(entry.result)) {
      incoming = {
        ...entry,
        result: { ...entry.result, accuracy: previousExact },
      };
    }
  }

  return { ...map, [entry.pointId]: incoming };
}

/** Entries belonging to exactly the given run (and mission when known). */
export function pointResultsForRun(
  map: PointResultMap,
  identity: MissionIdentity,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  if (!identity.runId) return out;
  for (const entry of Object.values(map)) {
    if (!conflictsWithIdentity(entry, identity) && entry.runId === identity.runId) {
      out[entry.pointId] = entry.result;
    }
  }
  return out;
}

/** Drop everything that does not belong to the current run. */
export function pruneToIdentity(
  map: PointResultMap,
  identity: MissionIdentity,
): PointResultMap {
  let changed = false;
  const next: Record<string, PointResultEntry> = {};
  for (const [key, entry] of Object.entries(map)) {
    if (conflictsWithIdentity(entry, identity)) {
      changed = true;
    } else {
      next[key] = entry;
    }
  }
  return changed ? next : map;
}

export type RuntimePointResult = Record<string, unknown>;

/**
 * Index runtime point results for one run. Entries that carry a different
 * mission_run_id are excluded, so a previous run's terminal accuracy can
 * never become the current run's row remark.
 */
export function indexRuntimePointResults(
  pointResults: unknown,
  runId: string | null,
): { byId: Map<string, RuntimePointResult>; byIndex: Map<number, RuntimePointResult> } {
  const byId = new Map<string, RuntimePointResult>();
  const byIndex = new Map<number, RuntimePointResult>();
  const rows = Array.isArray(pointResults)
    ? pointResults
    : pointResults && typeof pointResults === "object"
      ? Object.values(pointResults as Record<string, unknown>)
      : [];
  for (const candidate of rows) {
    if (!candidate || typeof candidate !== "object") continue;
    const row = candidate as RuntimePointResult;
    const rowRun = String(row.mission_run_id ?? "").trim();
    if (runId && rowRun && rowRun !== runId) continue;
    const pointId = String(row.point_id ?? "").trim();
    if (pointId) byId.set(pointId, row);
    const pointIndex = Number(row.point_index);
    if (Number.isInteger(pointIndex)) byIndex.set(pointIndex, row);
  }
  return { byId, byIndex };
}

function receivedAtMs(result: RuntimePointResult | undefined): number {
  const parsed = Date.parse(String(result?.received_at ?? ""));
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

/** Pick the later of two results for the same point (backend receive time). */
export function newerPointResult(
  a: RuntimePointResult | undefined,
  b: RuntimePointResult | undefined,
): RuntimePointResult | undefined {
  if (!a) return b;
  if (!b) return a;
  return receivedAtMs(b) > receivedAtMs(a) ? b : a;
}
