import { useState, useCallback, useRef } from 'react';
import { PathPlanWaypoint } from '../../types/pathplan';

const MAX_HISTORY = 50;

export interface WaypointHistory {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  recordAndApply: (newWaypoints: PathPlanWaypoint[]) => void;
  resetHistory: () => void;
}

/**
 * Hook that provides undo/redo for waypoint state changes.
 * Wraps `updateWaypoints` to automatically record history before each mutation.
 *
 * Usage:
 *   const { undo, redo, canUndo, canRedo, recordAndApply } = useWaypointHistory(waypoints, updateWaypoints);
 *   // Instead of calling updateWaypoints(newWps), call recordAndApply(newWps)
 */
export function useWaypointHistory(
  currentWaypoints: PathPlanWaypoint[],
  updateWaypoints: (wps: PathPlanWaypoint[]) => void,
): WaypointHistory {
  const undoStack = useRef<PathPlanWaypoint[][]>([]);
  const redoStack = useRef<PathPlanWaypoint[][]>([]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  /** Push current waypoints onto undo stack, then apply new ones. */
  const recordAndApply = useCallback((newWaypoints: PathPlanWaypoint[]) => {
    // Snapshot current state before the change
    undoStack.current.push([...currentWaypoints]);
    if (undoStack.current.length > MAX_HISTORY) {
      undoStack.current.shift();
    }
    // Clear redo — a new action invalidates the redo chain
    redoStack.current = [];
    updateFlags();
    updateWaypoints(newWaypoints);
  }, [currentWaypoints, updateWaypoints, updateFlags]);

  /** Undo: restore previous state, push current onto redo stack. */
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    redoStack.current.push([...currentWaypoints]);
    const prev = undoStack.current.pop()!;
    updateFlags();
    updateWaypoints(prev);
  }, [currentWaypoints, updateWaypoints, updateFlags]);

  /** Redo: restore next state, push current onto undo stack. */
  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    undoStack.current.push([...currentWaypoints]);
    const next = redoStack.current.pop()!;
    updateFlags();
    updateWaypoints(next);
  }, [currentWaypoints, updateWaypoints, updateFlags]);

  /** Clear all history (e.g., on mission load). */
  const resetHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    updateFlags();
  }, [updateFlags]);

  return { undo, redo, canUndo, canRedo, recordAndApply, resetHistory };
}