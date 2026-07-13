// ============================================================
// CAD Selection Manager Hook
// ============================================================
//
// Manages enhanced selection state for smart dimension editing.
// Supports point selection, point-pair selection, and multi-entity selection.

import { useState, useCallback, useRef } from 'react';
import { SelectionMode, SelectedPoint, SelectionState } from '../../components/cad/types/selection';
import { WorldPoint } from '../../core/cad';

interface UseSelectionManagerProps {
  /** Initial selection mode */
  initialMode?: SelectionMode;
  /** Callback when selection state changes */
  onSelectionChange?: (state: SelectionState) => void;
}

/**
 * Hook for managing CAD selection state with enhanced point-pair selection
 */
export function useSelectionManager({
  initialMode = 'entity',
  onSelectionChange,
}: UseSelectionManagerProps = {}) {

  // ── Selection State ──
  const [mode, setMode] = useState<SelectionMode>(initialMode);
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
  const [selectedPoints, setSelectedPoints] = useState<SelectedPoint[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  // Track previous state for change detection
  const prevStateRef = useRef<SelectionState | null>(null);

  /**
   * Generate unique point ID
   */
  const generatePointId = useCallback((entityId: string, pointType: string, index?: number): string => {
    const base = `${entityId}-${pointType}`;
    return index !== undefined ? `${base}-${index}` : base;
  }, []);

  /**
   * Switch selection mode
   */
  const switchMode = useCallback((newMode: SelectionMode) => {
    setMode(newMode);

    // Clear selection when switching modes
    setSelectedEntities(new Set());
    setSelectedPoints([]);
    setIsComplete(false);

    console.log(`[SelectionManager] Mode switched to: ${newMode}`);
  }, []);

  /**
   * Select a single entity (SolidWorks Smart Dimension style)
   */
  const selectEntity = useCallback((entityId: string) => {
    setSelectedEntities(new Set([entityId]));
    setSelectedPoints([]);
    setIsComplete(true);
  }, []);

  /**
   * Clear entity selection only (keep point selection)
   */
  const clearEntitySelectionOnly = useCallback(() => {
    setSelectedEntities(new Set());
  }, []);

  /**
   * Select up to two points for Smart Dimension distance constraints
   */
  const selectPointForSmartDimension = useCallback((point: SelectedPoint) => {
    setSelectedEntities(new Set());
    setSelectedPoints(prev => {
      const existingIndex = prev.findIndex(p => p.pointId === point.pointId);
      if (existingIndex !== -1) {
        return prev.filter(p => p.pointId !== point.pointId);
      }
      if (prev.length >= 2) {
        return [prev[1], point];
      }
      return [...prev, point];
    });
  }, []);

  /**
   * Select/deselect an entity
   */
  const toggleEntity = useCallback((entityId: string) => {
    setSelectedEntities(prev => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
        console.log(`[SelectionManager] Deselected entity: ${entityId}`);
      } else {
        next.add(entityId);
        console.log(`[SelectionManager] Selected entity: ${entityId}`);
      }
      return next;
    });
  }, []);

  /**
   * Select/deselect a point
   */
  const togglePoint = useCallback((point: SelectedPoint) => {
    setSelectedPoints(prev => {
      // Check if point is already selected
      const existingIndex = prev.findIndex(p => p.pointId === point.pointId);

      if (existingIndex !== -1) {
        // Deselect point
        const next = prev.filter(p => p.pointId !== point.pointId);
        console.log(`[SelectionManager] Deselected point: ${point.pointId}`);
        return next;
      } else {
        // Select point
        const maxPoints = mode === 'point-pair' ? 2 : undefined;
        if (maxPoints && prev.length >= maxPoints) {
          console.log(`[SelectionManager] Max points (${maxPoints}) reached, replacing first point`);
          // Replace first point in point-pair mode
          return [...prev.slice(1), point];
        }
        console.log(`[SelectionManager] Selected point: ${point.pointId}`);
        return [...prev, point];
      }
    });
  }, [mode]);

  /**
   * Clear all selections
   */
  const clearSelection = useCallback(() => {
    setSelectedEntities(new Set());
    setSelectedPoints([]);
    setIsComplete(false);
    console.log('[SelectionManager] Selection cleared');
  }, []);

  /**
   * Select all entities
   */
  const selectAllEntities = useCallback((entityIds: string[]) => {
    setSelectedEntities(new Set(entityIds));
    setSelectedPoints([]);
    console.log(`[SelectionManager] Selected all entities: ${entityIds.length}`);
  }, []);

  /**
   * Get current selection state
   */
  const getState = useCallback((): SelectionState => ({
    mode,
    selectedEntities,
    selectedPoints,
    maxPoints: mode === 'point-pair' ? 2 : undefined,
    isComplete: mode === 'point-pair' ? selectedPoints.length === 2 : selectedEntities.size > 0 || selectedPoints.length > 0,
  }), [mode, selectedEntities, selectedPoints]);

  // ── Selection Change Detection ──
  const currentState = getState();
  const hasChanged = prevStateRef.current === null ||
    JSON.stringify(prevStateRef.current) !== JSON.stringify(currentState);

  if (hasChanged) {
    prevStateRef.current = currentState;
    if (onSelectionChange) {
      onSelectionChange(currentState);
    }
  }

  return {
    // State
    mode,
    selectedEntities,
    selectedPoints,
    isComplete: currentState.isComplete,

    // Actions
    switchMode,
    selectEntity,
    clearEntitySelectionOnly,
    selectPointForSmartDimension,
    toggleEntity,
    togglePoint,
    clearSelection,
    selectAllEntities,
    getState,
  };
}