/**
 * useCADState — CAD georeferencing state for PathPlanScreen
 *
 * Manages CAD model, visibility, GPS input for reference points,
 * and georeferencing transform state.
 */

import { useReducer } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface GPSInput {
  lat: string;
  lon: string;
}

// ── State ──────────────────────────────────────────────────────────────────

export interface CADState {
  showCADCanvas: boolean;
  isCADMode: boolean;
  showGPSInput: boolean;
  gpsInputA: GPSInput;
  gpsInputB: GPSInput;
}

const initialCADState: CADState = {
  showCADCanvas: false,
  isCADMode: false,
  showGPSInput: false,
  gpsInputA: { lat: '', lon: '' },
  gpsInputB: { lat: '', lon: '' },
};

// ── Actions ────────────────────────────────────────────────────────────────

export type CADAction =
  | { type: 'SHOW_CAD_CANVAS'; visible: boolean }
  | { type: 'SET_CAD_MODE'; active: boolean }
  | { type: 'SHOW_GPS_INPUT'; visible: boolean }
  | { type: 'SET_GPS_INPUT_A'; input: GPSInput }
  | { type: 'SET_GPS_INPUT_B'; input: GPSInput }
  | { type: 'RESET_CAD' };

// ── Reducer ────────────────────────────────────────────────────────────────

function cadReducer(state: CADState, action: CADAction): CADState {
  switch (action.type) {
    case 'SHOW_CAD_CANVAS':
      return { ...state, showCADCanvas: action.visible };

    case 'SET_CAD_MODE':
      return { ...state, isCADMode: action.active };

    case 'SHOW_GPS_INPUT':
      return { ...state, showGPSInput: action.visible };

    case 'SET_GPS_INPUT_A':
      return { ...state, gpsInputA: action.input };

    case 'SET_GPS_INPUT_B':
      return { ...state, gpsInputB: action.input };

    case 'RESET_CAD':
      return initialCADState;

    default:
      return state;
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useCADState() {
  const [state, dispatch] = useReducer(cadReducer, initialCADState);
  return { state, dispatch } as const;
}

export default useCADState;