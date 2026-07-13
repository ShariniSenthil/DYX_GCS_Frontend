/**
 * useUploadState — Upload/import state for PathPlanScreen
 *
 * Manages all file upload, CSV/QXC parsing, preview, and path connection state.
 * Extracted from PathPlanScreen's 38 useState hooks to isolate re-renders:
 *   selecting a waypoint no longer re-renders the upload modal,
 *   and uploading a file no longer re-renders the drawing tools.
 */

import { useReducer } from 'react';
import { PathPlanWaypoint } from '../../types/pathplan';
import { ValidationError } from '../../utils/waypointValidator';

// ── State ──────────────────────────────────────────────────────────────────

export interface UploadState {
  missionName: string;
  uploadPreviewWaypoints: PathPlanWaypoint[] | null;
  uploadPreviewName: string;
  uploadPreviewValidationErrors: ValidationError[];
  uploadProgress: number;
  showUploadProgress: boolean;
  downloadProgress: number;
  showDownloadProgress: boolean;
  pathAssignmentMode: 'auto' | 'manual';
  manualPathConnections: number[];
  isConnectingPath: boolean;
  showReverseDialog: boolean;
}

const initialUploadState: UploadState = {
  missionName: 'DRAWN MISSION - 4:15:34',
  uploadPreviewWaypoints: null,
  uploadPreviewName: '',
  uploadPreviewValidationErrors: [],
  uploadProgress: 0,
  showUploadProgress: false,
  downloadProgress: 0,
  showDownloadProgress: false,
  pathAssignmentMode: 'auto',
  manualPathConnections: [],
  isConnectingPath: false,
  showReverseDialog: false,
};

// ── Actions ────────────────────────────────────────────────────────────────

export type UploadAction =
  | { type: 'SET_MISSION_NAME'; name: string }
  | { type: 'SET_PREVIEW_WAYPOINTS'; waypoints: PathPlanWaypoint[] | null; name?: string }
  | { type: 'SET_VALIDATION_ERRORS'; errors: ValidationError[] }
  | { type: 'SET_UPLOAD_PROGRESS'; pct: number }
  | { type: 'SET_SHOW_UPLOAD_PROGRESS'; visible: boolean }
  | { type: 'SET_DOWNLOAD_PROGRESS'; pct: number }
  | { type: 'SET_SHOW_DOWNLOAD_PROGRESS'; visible: boolean }
  | { type: 'SET_PATH_MODE'; mode: 'auto' | 'manual' }
  | { type: 'SET_MANUAL_CONNECTIONS'; indices: number[] }
  | { type: 'SET_CONNECTING_PATH'; connecting: boolean }
  | { type: 'SET_SHOW_REVERSE_DIALOG'; visible: boolean }
  | { type: 'RESET_UPLOAD' };

// ── Reducer ────────────────────────────────────────────────────────────────

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'SET_MISSION_NAME':
      return { ...state, missionName: action.name };

    case 'SET_PREVIEW_WAYPOINTS':
      return {
        ...state,
        uploadPreviewWaypoints: action.waypoints,
        uploadPreviewName: action.name ?? state.uploadPreviewName,
      };

    case 'SET_VALIDATION_ERRORS':
      return { ...state, uploadPreviewValidationErrors: action.errors };

    case 'SET_UPLOAD_PROGRESS':
      return { ...state, uploadProgress: action.pct };

    case 'SET_SHOW_UPLOAD_PROGRESS':
      return { ...state, showUploadProgress: action.visible };

    case 'SET_DOWNLOAD_PROGRESS':
      return { ...state, downloadProgress: action.pct };

    case 'SET_SHOW_DOWNLOAD_PROGRESS':
      return { ...state, showDownloadProgress: action.visible };

    case 'SET_PATH_MODE':
      return { ...state, pathAssignmentMode: action.mode };

    case 'SET_MANUAL_CONNECTIONS':
      return { ...state, manualPathConnections: action.indices };

    case 'SET_CONNECTING_PATH':
      return { ...state, isConnectingPath: action.connecting };

    case 'SET_SHOW_REVERSE_DIALOG':
      return { ...state, showReverseDialog: action.visible };

    case 'RESET_UPLOAD':
      return {
        ...initialUploadState,
        missionName: state.missionName, // preserve name across resets
      };

    default:
      return state;
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useUploadState() {
  const [state, dispatch] = useReducer(uploadReducer, initialUploadState);
  return { state, dispatch } as const;
}

export default useUploadState;