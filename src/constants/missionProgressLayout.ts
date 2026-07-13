/** Shared overlay layout for Mission Progress — aligned with AppHeader + PathPlanScreen. */
export const MISSION_PROGRESS_LAYOUT = {
  /** Horizontal / vertical inset from screen edges */
  EDGE: 16,
  /** Clear AppHeader row (top 14 + height 58 + 4px gap) */
  HEADER_CLEARANCE: 76,
  LEFT_PANEL_WIDTH: 280,
  RIGHT_PANEL_WIDTH: 320,
  PANEL_GAP: 16,
  BOTTOM_INSET: 16,
  /** Expanded bottom table body height */
  BOTTOM_TABLE_BODY_HEIGHT: 240,
  /** Fallback top for mission progress before robot panel is measured (header clearance + 345px card + gap) */
  MISSION_PROGRESS_STACK_FALLBACK: 437,
  /** Fallback top for mission controls before system panel is measured */
  MISSION_CONTROLS_STACK_FALLBACK: 180,
  /** Bottom waypoint table header row height */
  BOTTOM_TABLE_HEADER_HEIGHT: 60,
} as const;

export function getMissionProgressBottomTableInsets() {
  const { EDGE, LEFT_PANEL_WIDTH, RIGHT_PANEL_WIDTH, PANEL_GAP } = MISSION_PROGRESS_LAYOUT;
  return {
    left: EDGE + LEFT_PANEL_WIDTH + PANEL_GAP,
    right: EDGE + RIGHT_PANEL_WIDTH + PANEL_GAP,
  };
}
