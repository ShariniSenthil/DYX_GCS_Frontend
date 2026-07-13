/**
 * useMapState — Map view state for PathPlanScreen
 *
 * Manages map center, zoom, follow mode, selected waypoint, labels,
 * visualization settings, and fullscreen/collapse state.
 * Isolated so that waypoint selection only re-renders map-related children.
 */

import { useReducer } from 'react';
import { MapVisualization } from '../../components/pathplan/MapVisualizationControls';

// ── State ──────────────────────────────────────────────────────────────────

export interface MapState {
  selectedWaypoint: number | null;
  homePosition: { lat: number; lng: number } | null;
  isMapFullscreen: boolean;
  isDrawingToolsCollapsed: boolean;
  mapVisualization: MapVisualization;
}

const initialMapVisualization: MapVisualization = {
  distanceLabel: true,
  angleLabel: true,
  snapFeature: true,
  roverIcon: true,
  waypointPreview: true,
};

const initialMapState: MapState = {
  selectedWaypoint: null,
  homePosition: null,
  isMapFullscreen: false,
  isDrawingToolsCollapsed: false,
  mapVisualization: initialMapVisualization,
};

// ── Actions ────────────────────────────────────────────────────────────────

export type MapAction =
  | { type: 'SELECT_WAYPOINT'; id: number | null }
  | { type: 'SET_HOME_POSITION'; position: { lat: number; lng: number } | null }
  | { type: 'TOGGLE_FULLSCREEN' }
  | { type: 'SET_FULLSCREEN'; fullscreen: boolean }
  | { type: 'TOGGLE_DRAWING_TOOLS_COLLAPSED' }
  | { type: 'SET_DRAWING_TOOLS_COLLAPSED'; collapsed: boolean }
  | { type: 'SET_MAP_VISUALIZATION'; visualization: MapVisualization }
  | { type: 'TOGGLE_VISUALIZATION_KEY'; key: keyof MapVisualization }
  | { type: 'RESET_MAP' };

// ── Reducer ────────────────────────────────────────────────────────────────

function mapReducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case 'SELECT_WAYPOINT':
      return { ...state, selectedWaypoint: action.id };

    case 'SET_HOME_POSITION':
      return { ...state, homePosition: action.position };

    case 'TOGGLE_FULLSCREEN':
      return { ...state, isMapFullscreen: !state.isMapFullscreen };

    case 'SET_FULLSCREEN':
      return { ...state, isMapFullscreen: action.fullscreen };

    case 'TOGGLE_DRAWING_TOOLS_COLLAPSED':
      return { ...state, isDrawingToolsCollapsed: !state.isDrawingToolsCollapsed };

    case 'SET_DRAWING_TOOLS_COLLAPSED':
      return { ...state, isDrawingToolsCollapsed: action.collapsed };

    case 'SET_MAP_VISUALIZATION':
      return { ...state, mapVisualization: action.visualization };

    case 'TOGGLE_VISUALIZATION_KEY':
      return {
        ...state,
        mapVisualization: {
          ...state.mapVisualization,
          [action.key]: !state.mapVisualization[action.key],
        },
      };

    case 'RESET_MAP':
      return { ...initialMapState, homePosition: state.homePosition };

    default:
      return state;
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useMapState() {
  const [state, dispatch] = useReducer(mapReducer, initialMapState);
  return { state, dispatch } as const;
}

export default useMapState;