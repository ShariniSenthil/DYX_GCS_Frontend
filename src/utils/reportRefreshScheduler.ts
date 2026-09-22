/**
 * Canonical Mission Report refresh scheduling.
 *
 * The canonical report (GET /api/mission/report) is durable confirmation and
 * hydration, never the thing an operator waits on for a row update. It must
 * be requested only for meaningful mission changes, and a burst of requests
 * must still be serviced promptly.
 *
 * The previous implementation restarted an 80 ms debounce on every
 * mission_status packet. At a 50 Hz stream the timer never expired, so the
 * refresh was starved until the slow periodic poll.
 */

export type ReportRefreshReason =
  | "point_terminal"
  | "mission_lifecycle"
  | "mission_completed"
  | "hydration"
  | "manual";

type TimerHandle = ReturnType<typeof setTimeout>;

export interface CoalescedRefreshOptions {
  delayMs: number;
  run: () => void;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}

/**
 * Throttle-style coalescer: the first request arms a timer, later requests
 * inside the window join it. The timer is never pushed back, so a refresh
 * always runs at most `delayMs` after the first pending request.
 */
export class CoalescedRefresh {
  private handle: TimerHandle | null = null;
  private readonly delayMs: number;
  private readonly run: () => void;
  private readonly setTimer: NonNullable<CoalescedRefreshOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<CoalescedRefreshOptions["clearTimer"]>;

  constructor(options: CoalescedRefreshOptions) {
    this.delayMs = options.delayMs;
    this.run = options.run;
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h));
  }

  request(): void {
    if (this.handle !== null) return;
    this.handle = this.setTimer(() => {
      this.handle = null;
      this.run();
    }, this.delayMs);
  }

  get pending(): boolean {
    return this.handle !== null;
  }

  cancel(): void {
    if (this.handle !== null) {
      this.clearTimer(this.handle);
      this.handle = null;
    }
  }
}

const TERMINAL_POINT_SOCKET_EVENTS = new Set([
  "point_completed",
  "point_failed",
  "point_skipped",
]);

const TERMINAL_POINT_EVENT_NAMES = new Set([
  "COMPLETED",
  "FAILED",
  "SKIPPED",
  "ACCURACY_ACHIEVED",
  "ACCURACY_FAILED",
]);

export function isTerminalPointSocketEvent(eventName: string): boolean {
  return TERMINAL_POINT_SOCKET_EVENTS.has(eventName);
}

export function isTerminalPointEventPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const name = String((payload as { event?: unknown }).event ?? "")
    .trim()
    .toUpperCase();
  return TERMINAL_POINT_EVENT_NAMES.has(name);
}

/**
 * The fields of a mission_status snapshot whose change can alter canonical
 * report rows. Continuously varying diagnostics (ages, hold timers, RTK
 * correction age) are deliberately excluded.
 */
export function missionReportSignature(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  const last =
    s.last_point_event && typeof s.last_point_event === "object"
      ? (s.last_point_event as Record<string, unknown>)
      : null;
  return JSON.stringify([
    s.mission_id ?? null,
    s.mission_run_id ?? null,
    String(s.state ?? "").toUpperCase(),
    s.completed_points ?? null,
    s.failed_points ?? null,
    s.skipped_points ?? null,
    s.active_point_index ?? null,
    last ? [last.point_id ?? null, last.event ?? null, last.received_at ?? null] : null,
  ]);
}

/**
 * Decide whether a generic mission event warrants a canonical refresh.
 * `previousSignature` is the signature of the last mission_status snapshot
 * that was inspected; the caller stores the returned signature.
 */
export function classifyMissionEventForReport(
  event: unknown,
  previousSignature: string | null,
): { refresh: boolean; reason: ReportRefreshReason | null; signature: string | null } {
  if (!event || typeof event !== "object") {
    return { refresh: false, reason: null, signature: previousSignature };
  }
  const type = String((event as { type?: unknown }).type ?? "");

  if (type === "mission_completed" || type === "mission_completion_degraded") {
    return { refresh: true, reason: "mission_completed", signature: previousSignature };
  }
  if (type && type !== "mission_status") {
    // Errors, e-stop results, joystick errors: not report-changing.
    return { refresh: false, reason: null, signature: previousSignature };
  }

  const signature = missionReportSignature(event);
  if (signature === null || signature === previousSignature) {
    return { refresh: false, reason: null, signature: previousSignature };
  }
  // The first snapshot after mount is hydration; later ones are changes.
  return {
    refresh: true,
    reason: previousSignature === null ? "hydration" : "mission_lifecycle",
    signature,
  };
}
