export type MissionStartStage =
  | "confirm"
  | "handle_enter"
  | "execution_mode"
  | "estop_release"
  | "start_post_sent"
  | "start_post_returned"
  | "backend_phase"
  | "first_motion";

export type MissionStartTimingEvent = {
  attemptId: string;
  stage: MissionStartStage;
  atMs: number;
  detail?: string;
};

export function createMissionStartAttemptId(nowMs = Date.now()): string {
  return `start-${nowMs}`;
}

export function formatMissionStartTiming(
  event: MissionStartTimingEvent,
): string {
  const detail = event.detail ? ` ${event.detail}` : "";
  return `[MissionStartTiming] ${event.attemptId} ${event.stage} t=${event.atMs}${detail}`;
}

export function logMissionStartTiming(
  attemptId: string,
  stage: MissionStartStage,
  detail?: string,
  nowMs = Date.now(),
): MissionStartTimingEvent {
  const event: MissionStartTimingEvent = {
    attemptId,
    stage,
    atMs: nowMs,
    detail,
  };
  console.log(formatMissionStartTiming(event));
  return event;
}
