/**
 * useMissionState — Mission runtime state for PathPlanScreen
 *
 * Manages failsafe UI state, manual control panel visibility,
 * and global servo toggle. Isolated so that failsafe popups don't
 * re-render drawing tools or upload modals.
 */

import { useReducer } from 'react';

// ── State ──────────────────────────────────────────────────────────────────

export interface MissionState {
  globalServoEnabled: boolean;
  showFailsafeModeSelector: boolean;
  showStrictPopup: boolean;
  showRelaxNotification: boolean;
  failsafeEvent: { wpDistCm: number; thresholdCm: number } | null;
  showManualControl: boolean;
}

const initialMissionState: MissionState = {
  globalServoEnabled: true,
  showFailsafeModeSelector: false,
  showStrictPopup: false,
  showRelaxNotification: false,
  failsafeEvent: null,
  showManualControl: false,
};

// ── Actions ────────────────────────────────────────────────────────────────

export type MissionAction =
  | { type: 'SET_SERVO_ENABLED'; enabled: boolean }
  | { type: 'TOGGLE_SERVO' }
  | { type: 'SHOW_FAILSAFE_SELECTOR'; visible: boolean }
  | { type: 'SHOW_STRICT_POPUP'; visible: boolean }
  | { type: 'SHOW_RELAX_NOTIFICATION'; visible: boolean }
  | { type: 'SET_FAILSAFE_EVENT'; event: { wpDistCm: number; thresholdCm: number } | null }
  | { type: 'SHOW_MANUAL_CONTROL'; visible: boolean }
  | { type: 'RESET_MISSION' };

// ── Reducer ────────────────────────────────────────────────────────────────

function missionReducer(state: MissionState, action: MissionAction): MissionState {
  switch (action.type) {
    case 'SET_SERVO_ENABLED':
      return { ...state, globalServoEnabled: action.enabled };

    case 'TOGGLE_SERVO':
      return { ...state, globalServoEnabled: !state.globalServoEnabled };

    case 'SHOW_FAILSAFE_SELECTOR':
      return { ...state, showFailsafeModeSelector: action.visible };

    case 'SHOW_STRICT_POPUP':
      return { ...state, showStrictPopup: action.visible };

    case 'SHOW_RELAX_NOTIFICATION':
      return { ...state, showRelaxNotification: action.visible };

    case 'SET_FAILSAFE_EVENT':
      return { ...state, failsafeEvent: action.event };

    case 'SHOW_MANUAL_CONTROL':
      return { ...state, showManualControl: action.visible };

    case 'RESET_MISSION':
      return initialMissionState;

    default:
      return state;
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useMissionState() {
  const [state, dispatch] = useReducer(missionReducer, initialMissionState);
  return { state, dispatch } as const;
}

export default useMissionState;