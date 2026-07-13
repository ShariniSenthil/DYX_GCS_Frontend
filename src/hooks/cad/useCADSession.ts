// ============================================================
// useCADSession — master state hook for the CAD editor
// ============================================================
//
// Owns: entities, undo/redo, current tool, layers, snap settings,
// viewport, and command input state. This is the single source
// of truth for the CAD canvas.

import { useState, useCallback, useRef, useMemo } from 'react';
import {
  CADEntity,
  CADTool,
  CADLayer,
  DraftingSettings,
  DEFAULT_DRAFTING_SETTINGS,
  DEFAULT_LAYERS,
  Viewport,
  CanvasSize,
  WorldPoint,
  SnapResult,
} from '../../core/cad';
import {
  createDefaultViewport,
  screenToWorld,
  worldToScreen,
  resolveSnap,
  resolvePolarTrack,
  resolveOrtho,
} from '../../core/cad';

export interface ToolState {
  /** Current active tool */
  activeTool: CADTool;
  /** Points collected so far for the current tool operation */
  pickedPoints: WorldPoint[];
  /** Whether we're in the middle of a multi-step tool operation */
  isDrawing: boolean;
}

export interface CADSession {
  // Entity state
  entities: CADEntity[];
  layers: CADLayer[];
  currentLayerId: string;

  // Viewport
  viewport: Viewport;
  setViewport: (vp: Viewport) => void;

  // Tool state
  tool: ToolState;
  setActiveTool: (tool: CADTool) => void;
  pickPoint: (point: WorldPoint) => void;
  cancelTool: () => void;

  // Drafting settings
  settings: DraftingSettings;

  // Snapping
  snapTo: (cursorScreen: { x: number; y: number }) => SnapResult | null;

  // Polar/Ortho resolution
  resolveAngleConstraint: (anchor: WorldPoint, cursor: WorldPoint) => WorldPoint;

  // Entity operations
  addEntity: (e: CADEntity) => void;
  deleteEntity: (id: string) => void;
  clearEntities: () => void;
  selectedEntityId: string | null;
  setSelectedEntityId: (id: string | null) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Layers
  setCurrentLayer: (id: string) => void;
}

export function useCADSession(canvasSize: CanvasSize): CADSession {
  // ── Entity state ──
  const [entities, setEntities] = useState<CADEntity[]>([]);
  const [undoStack, setUndoStack] = useState<CADEntity[][]>([]);
  const [redoStack, setRedoStack] = useState<CADEntity[][]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // ── Layers ──
  const [layers] = useState<CADLayer[]>(DEFAULT_LAYERS);
  const [currentLayerId, setCurrentLayerId] = useState<string>('layer-0');

  // ── Viewport ──
  const [viewport, setViewport] = useState<Viewport>(() => createDefaultViewport(canvasSize));

  // ── Tool state ──
  const [activeTool, setActiveToolState] = useState<CADTool>('select');
  const [pickedPoints, setPickedPoints] = useState<WorldPoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // ── Settings ──
  const [settings] = useState<DraftingSettings>(DEFAULT_DRAFTING_SETTINGS);

  // ── Refs for stable callbacks ──
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const undoStackRef = useRef(undoStack);
  undoStackRef.current = undoStack;

  const currentLayerName = useMemo(() => {
    return layers.find(l => l.id === currentLayerId)?.name ?? '0';
  }, [layers, currentLayerId]);

  // ── Entity operations ──
  const pushUndo = useCallback((ents: CADEntity[]) => {
    setUndoStack(prev => [...prev.slice(-49), ents]);
    setRedoStack([]);
  }, []);

  const addEntity = useCallback((e: CADEntity) => {
    setEntities(prev => {
      pushUndo(prev);
      return [...prev, e];
    });
  }, [pushUndo]);

  const deleteEntity = useCallback((id: string) => {
    setEntities(prev => {
      pushUndo(prev);
      return prev.filter(e => e.id !== id);
    });
    setSelectedEntityId(null);
  }, [pushUndo]);

  const clearEntities = useCallback(() => {
    setEntities(prev => {
      pushUndo(prev);
      return [];
    });
  }, [pushUndo]);

  // ── Undo/Redo ──
  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack(r => [...r, entitiesRef.current]);
      setEntities(last);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack(u => [...u, entitiesRef.current]);
      setEntities(next);
      return prev.slice(0, -1);
    });
  }, []);

  // ── Tool operations ──
  const setActiveTool = useCallback((tool: CADTool) => {
    setActiveToolState(tool);
    setPickedPoints([]);
    setIsDrawing(false);
    setSelectedEntityId(null);
  }, []);

  const cancelTool = useCallback(() => {
    setPickedPoints([]);
    setIsDrawing(false);
  }, []);

  const pickPoint = useCallback((point: WorldPoint) => {
    setPickedPoints(prev => {
      const newPoints = [...prev, point];
      setIsDrawing(true);
      return newPoints;
    });
  }, []);

  // ── Snapping ──
  const snapTo = useCallback((cursorScreen: { x: number; y: number }): SnapResult | null => {
    const vp = viewportRef.current;
    const s = settingsRef.current;
    if (!s.snap.enabled) return null;

    const worldCursor = screenToWorld(cursorScreen, vp);
    return resolveSnap(worldCursor, entitiesRef.current, s.snap.runningSnaps, s.snap.aperturePx, vp);
  }, []);

  // ── Polar/Ortho resolution ──
  const resolveAngleConstraint = useCallback((anchor: WorldPoint, cursor: WorldPoint): WorldPoint => {
    const s = settingsRef.current;
    if (s.ortho.enabled) {
      return resolveOrtho(anchor, cursor);
    }
    if (s.polar.enabled) {
      const result = resolvePolarTrack(anchor, cursor, s.polar.angles, s.polar.toleranceDeg);
      if (result) return result.snappedPoint;
    }
    return cursor;
  }, []);

  // ── Commit final entity (called by the canvas when a tool completes) ──
  const commitEntity = useCallback((e: CADEntity) => {
    addEntity(e);
    setPickedPoints([]);
    setIsDrawing(false);
  }, [addEntity]);

  return {
    entities,
    layers,
    currentLayerId,
    viewport,
    setViewport,
    tool: { activeTool, pickedPoints, isDrawing },
    setActiveTool,
    pickPoint,
    cancelTool,
    settings,
    snapTo,
    resolveAngleConstraint,
    addEntity,
    deleteEntity,
    clearEntities,
    selectedEntityId,
    setSelectedEntityId,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    setCurrentLayer: setCurrentLayerId,
  };
}
