/**
 * useDrawingState — Drawing/measurement tool state for PathPlanScreen
 *
 * Manages active drawing tool, drawing mode, measure points, and drawing dialogs.
 * Isolated so that drawing interactions don't re-render upload/map/mission UI.
 */

import { useReducer } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export type DrawingTool = 'circle' | 'survey' | 'text' | 'freehand' | 'line' | 'measure' | null;

export interface MeasurePoint {
  lat: number;
  lon: number;
  seq: number;
  waypointId?: number;
}

export interface MeasureResult {
  distance: number;
  heading: number;
}

// ── State ──────────────────────────────────────────────────────────────────

export interface DrawingState {
  activeDrawingTool: DrawingTool;
  showCircleDialog: boolean;
  showSurveyGridDialog: boolean;
  showTextDialog: boolean;
  isDrawingMode: boolean;
  measurePoints: MeasurePoint[];
  measureResult: MeasureResult | null;
}

const initialDrawingState: DrawingState = {
  activeDrawingTool: null,
  showCircleDialog: false,
  showSurveyGridDialog: false,
  showTextDialog: false,
  isDrawingMode: false,
  measurePoints: [],
  measureResult: null,
};

// ── Actions ────────────────────────────────────────────────────────────────

export type DrawingAction =
  | { type: 'SET_TOOL'; tool: DrawingTool }
  | { type: 'SET_DRAWING_MODE'; active: boolean }
  | { type: 'SHOW_CIRCLE_DIALOG'; visible: boolean }
  | { type: 'SHOW_SURVEY_GRID_DIALOG'; visible: boolean }
  | { type: 'SHOW_TEXT_DIALOG'; visible: boolean }
  | { type: 'ADD_MEASURE_POINT'; point: MeasurePoint }
  | { type: 'SET_MEASURE_RESULT'; result: MeasureResult | null }
  | { type: 'CLEAR_MEASURE' }
  | { type: 'RESET_DRAWING' };

// ── Reducer ────────────────────────────────────────────────────────────────

function drawingReducer(state: DrawingState, action: DrawingAction): DrawingState {
  switch (action.type) {
    case 'SET_TOOL':
      return { ...state, activeDrawingTool: action.tool };

    case 'SET_DRAWING_MODE':
      return { ...state, isDrawingMode: action.active };

    case 'SHOW_CIRCLE_DIALOG':
      return { ...state, showCircleDialog: action.visible };

    case 'SHOW_SURVEY_GRID_DIALOG':
      return { ...state, showSurveyGridDialog: action.visible };

    case 'SHOW_TEXT_DIALOG':
      return { ...state, showTextDialog: action.visible };

    case 'ADD_MEASURE_POINT':
      return { ...state, measurePoints: [...state.measurePoints, action.point] };

    case 'SET_MEASURE_RESULT':
      return { ...state, measureResult: action.result };

    case 'CLEAR_MEASURE':
      return { ...state, measurePoints: [], measureResult: null };

    case 'RESET_DRAWING':
      return initialDrawingState;

    default:
      return state;
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useDrawingState() {
  const [state, dispatch] = useReducer(drawingReducer, initialDrawingState);
  return { state, dispatch } as const;
}

export default useDrawingState;