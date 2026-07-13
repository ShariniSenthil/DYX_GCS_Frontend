// ============================================================
// CADDrawingCanvas — New AutoCAD-style drawing canvas
// ============================================================
//
// World coordinate system, SVG rendering, pan/zoom viewport,
// snapping, multi-step tools, DXF output.
//
// This replaces the legacy pixel-based CADDrawingCanvas.

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  PanResponder,
  Alert,
  TextInput,
  LayoutChangeEvent,
} from 'react-native';
import Svg, { G, Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import {
  CADEntity,
  CADTool,
  WorldPoint,
  ScreenPoint,
  Viewport,
  CanvasSize,
  SnapResult,
  SnapMode,
  UnitSystem,
  UNIT_LABEL,
} from '../../core/cad';
import {
  worldToScreen,
  screenToWorld,
  createDefaultViewport,
  zoomAt,
  panBy,
  computeFitViewport,
  entitiesToDXF,
  resolveSnap,
  resolveGridSnap,
  DEFAULT_RUNNING_SNAPS,
  resolvePolarTrack,
  resolveOrtho,
  parseCADInput,
  resolveParsedInput,
  angleDeg,
  distance as distPoints,
  entitiesBounds,
  entityBounds,
  createLine,
  createCircle,
  createArc3Point,
  createRectangle,
  createPoint,
  createText,
  createPolyline,
} from '../../core/cad';
import { saveDxfFileToDevice } from '../../utils/downloadHelper';
import { useSelectionManager } from '../../hooks/cad/useSelectionManager';
import { extractSelectablePoints, findClosestSelectablePoint, updateMarkerSelectionState } from '../../utils/cadPointUtils';
import { detectDimensionsForSelection } from '../../utils/cadDimensionUtils';
import { applyDimensionChange } from '../../utils/cadGeometryUpdates';
import { PointMarker } from './types/selection';
import { DimensionAnnotation } from './types/dimension';
import { CADGrid } from './CADGrid';
import { CADEntityRenderer } from './CADEntityRenderer';
import { CADCursorOverlay } from './CADCursorOverlay';
import { CADUCSIcon } from './CADUCSIcon';
import { CADCommandBar } from './CADCommandBar';
import { CADPointMarkers } from './CADPointMarker';
import { CADimensionAnnotation } from './CADimensionAnnotation';
import { CADimensionEditor } from './CADimensionEditor';

// ============================================================
// Types
// ============================================================

export interface CADDrawingCanvasProps {
  visible: boolean;
  onClose: () => void;
  onSaveDXF?: (dxfContent: string, entities: CADEntity[], importMode?: 'waypoints' | 'entities') => void;
  initialEntities?: CADEntity[];
  units?: UnitSystem;
}

// ============================================================
// Tool definitions
// ============================================================

interface ToolDef {
  name: CADTool;
  icon: string;
  title: string;
}

const TOOLS: ToolDef[] = [
  { name: 'select', icon: 'cursor-default', title: 'Select' },
  { name: 'line', icon: 'vector-line', title: 'Line' },
  { name: 'polyline', icon: 'polyline', title: 'PLine' },
  { name: 'rectangle', icon: 'rectangle-outline', title: 'Rect' },
  { name: 'circle', icon: 'circle-outline', title: 'Circle' },
  { name: 'arc', icon: 'vector-curve', title: 'Arc' },
  { name: 'point', icon: 'circle-small', title: 'Point' },
  { name: 'text', icon: 'text-box-outline', title: 'Text' },
];

/** Stable layer list — must not be recreated each render (breaks entity memo). */
const CANVAS_LAYERS = [
  { id: '0', name: '0', color: '#22C55E', visible: true, locked: false },
  { id: 'mark', name: 'MARK', color: '#3B82F6', visible: true, locked: false },
  { id: 'text', name: 'TEXT', color: '#A855F7', visible: true, locked: false },
  { id: 'dim', name: 'DIMENSIONS', color: '#6B7280', visible: true, locked: false },
];

const PREVIEW_LAYERS = [
  { id: 'preview', name: 'MARK', color: '#F59E0B', visible: true, locked: false },
];

/** Running object snaps — AutoCAD-like defaults (nearest off: too sticky). */
const SNAP_MODES: Set<SnapMode> = new Set(DEFAULT_RUNNING_SNAPS);

const POLAR_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
const POLAR_TOLERANCE = 5;
const SNAP_APERTURE_PX = 12;
const GRID_SPACING = 1;
const CURSOR_THROTTLE_MS = 33;
const PAN_SLOP_PX = 5;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 24;

// ============================================================
// Component
// ============================================================

export const CADDrawingCanvas: React.FC<CADDrawingCanvasProps> = ({
  visible,
  onClose,
  onSaveDXF,
  initialEntities = [],
  units = 'm',
}) => {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({
    width: screenWidth,
    height: screenHeight - 140,
  });
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;

  // ── Entity state ──
  const [entities, setEntities] = useState<CADEntity[]>(initialEntities);
  const [undoStack, setUndoStack] = useState<CADEntity[][]>([]);
  const [redoStack, setRedoStack] = useState<CADEntity[][]>([]);

  const pushUndo = useCallback((ents: CADEntity[]) => {
    setUndoStack(prev => [...prev.slice(-49), ents]);
    setRedoStack([]);
  }, []);

  // ── Viewport — mutate ref during gestures, commit to state on rAF ──
  const viewportRef = useRef<Viewport>(createDefaultViewport(canvasSize));

  // ── Tool state ──
  const [activeTool, setActiveTool] = useState<CADTool>('select');
  const [pickedPoints, setPickedPoints] = useState<WorldPoint[]>([]);
  const [cursorScreen, setCursorScreen] = useState<ScreenPoint | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [marqueeScreen, setMarqueeScreen] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');
  const [pendingSaveDXF, setPendingSaveDXF] = useState<{
    dxfContent: string;
    entities: CADEntity[];
  } | null>(null);
  const [showFilenameInput, setShowFilenameInput] = useState(false);
  const [filenameInput, setFilenameInput] = useState('');

  // ── Drafting settings ──
  const [orthoEnabled, setOrthoEnabled] = useState(false);
  const [polarEnabled, setPolarEnabled] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridEnabled, setGridEnabled] = useState(true);

  // ── Enhanced Selection System for Smart Dimensions ──
  const {
    mode: selectionMode,
    selectedEntities: selectedEntitiesSet,
    selectedPoints,
    isComplete: selectionComplete,
    switchMode,
    selectEntity,
    clearEntitySelectionOnly,
    selectPointForSmartDimension,
    toggleEntity,
    togglePoint,
    clearSelection,
  } = useSelectionManager({
    initialMode: 'entity',
    onSelectionChange: (state) => {
      console.log('[CADDrawingCanvas] Selection changed:', state);
    },
  });

  // ── Smart Dimension Mode (SolidWorks-style) ──
  const [smartDimensionActive, setSmartDimensionActive] = useState(false);
  const smartDimensionActiveRef = useRef(false);
  smartDimensionActiveRef.current = smartDimensionActive;

  // ── Point Markers for Selection ──
  const [pointMarkers, setPointMarkers] = useState<PointMarker[]>([]);
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);

  // Update point markers when entities or selection changes
  useEffect(() => {
    const showMarkers = smartDimensionActive
      || selectionMode === 'point'
      || selectionMode === 'point-pair';

    if (showMarkers) {
      const allMarkers: PointMarker[] = [];
      entities.forEach(entity => {
        const points = extractSelectablePoints(entity, viewportRef.current);
        points.forEach(({ marker }) => {
          allMarkers.push(marker);
        });
      });
      setPointMarkers(updateMarkerSelectionState(allMarkers, selectedPoints));
    } else {
      setPointMarkers([]);
    }
  }, [entities, smartDimensionActive, selectionMode, selectedPoints]);

  // ── Dimension Detection State ──
  const [detectedDimensions, setDetectedDimensions] = useState<DimensionAnnotation[]>([]);
  const [dimensionEditorVisible, setDimensionEditorVisible] = useState(false);
  const [editingDimension, setEditingDimension] = useState<DimensionAnnotation | null>(null);

  // Update dimensions when selection is complete
  useEffect(() => {
    const shouldDetect = smartDimensionActive
      ? (selectedEntitiesSet.size > 0 || selectedPoints.length === 2)
      : (selectionComplete && (selectedPoints.length === 2 || selectedEntitiesSet.size > 0));

    if (shouldDetect) {
      const dimensions = detectDimensionsForSelection(
        selectedPoints,
        selectedEntitiesSet,
        entities
      );
      setDetectedDimensions(dimensions);
    } else {
      setDetectedDimensions([]);
    }
  }, [smartDimensionActive, selectionComplete, selectedPoints, selectedEntitiesSet, entities]);

  // ── Dimension Editing Handlers ──
  const handleDimensionPress = useCallback((dimension: DimensionAnnotation) => {
    console.log('[CADDrawingCanvas] Opening dimension editor for:', dimension.label);
    setEditingDimension(dimension);
    setDimensionEditorVisible(true);
  }, []);

  const handleDimensionEditApply = useCallback((newValue: number) => {
    if (!editingDimension) return;

    const updatedEntities = applyDimensionChange(
      entities,
      editingDimension,
      newValue,
      selectedPoints
    );

    pushUndo(entities);
    setEntities(updatedEntities);

    const newDimensions = detectDimensionsForSelection(
      selectedPoints,
      selectedEntitiesSet,
      updatedEntities
    );
    setDetectedDimensions(newDimensions);

    setDimensionEditorVisible(false);
    setEditingDimension(null);
  }, [editingDimension, entities, selectedPoints, selectedEntitiesSet, pushUndo]);

  const handleDimensionEditCancel = useCallback(() => {
    console.log('[CADDrawingCanvas] Dimension edit cancelled');
    setDimensionEditorVisible(false);
    setEditingDimension(null);
  }, []);

  // ── Point Marker Interaction Handlers ──
  const handleMarkerPress = useCallback((marker: PointMarker) => {
    // Find the corresponding selected point data
    entities.forEach(entity => {
      const points = extractSelectablePoints(entity, viewportRef.current);
      const foundPoint = points.find(p => p.marker.pointId === marker.pointId);
      if (foundPoint) {
        togglePoint(foundPoint.point);
      }
    });
  }, [entities, togglePoint]);

  const handleMarkerHover = useCallback((marker: PointMarker, isHovered: boolean) => {
    setHoveredMarker(isHovered ? marker.pointId : null);
    setPointMarkers(prev =>
      prev.map(m => m.pointId === marker.pointId ? { ...m, isHovered } : m)
    );
  }, []);

  // ── Refs ──
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const pickedRef = useRef(pickedPoints);
  pickedRef.current = pickedPoints;
  const snapEnabledRef = useRef(snapEnabled);
  snapEnabledRef.current = snapEnabled;
  const gridEnabledRef = useRef(gridEnabled);
  gridEnabledRef.current = gridEnabled;
  const orthoEnabledRef = useRef(orthoEnabled);
  orthoEnabledRef.current = orthoEnabled;
  const polarEnabledRef = useRef(polarEnabled);
  polarEnabledRef.current = polarEnabled;

  // ── Pan/Zoom / marquee gesture refs ──
  const lastPanPointRef = useRef<ScreenPoint | null>(null);
  const isPanningRef = useRef(false);
  const isPinchingRef = useRef(false);
  const isMarqueeRef = useRef(false);
  const marqueeStartRef = useRef<ScreenPoint | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const pendingPickRef = useRef<{
    tool: CADTool;
    point: WorldPoint;
    screen: ScreenPoint;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const pinchStartDistRef = useRef(0);
  const pinchStartViewportRef = useRef<Viewport | null>(null);
  const pinchStartMidRef = useRef<ScreenPoint>({ x: 0, y: 0 });

  // ── Throttle / rAF refs ──
  const lastCursorUpdateRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // ── Function refs (for PanResponder to call without stale closures) ──
  const handleToolPickRef = useRef<(tool: CADTool, point: WorldPoint, screen: ScreenPoint) => void>(() => {});
  const resolveCursorRef = useRef<(anchor: WorldPoint | null) => WorldPoint | null>(() => null);

  // Snapshot used for rendering — only updates on rAF flush / explicit zoom
  const [viewport, setViewport] = useState<Viewport>(() => viewportRef.current);

  const scheduleViewportFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setViewport({ ...viewportRef.current });
    });
  }, []);

  const commitViewport = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setViewport({ ...viewportRef.current });
  }, []);

  /**
   * AutoCAD pick resolution order:
   * 1. Object snap (within aperture) — wins over everything
   * 2. Grid snap (if GRID on and SNAP on, within aperture)
   * 3. ORTHO / POLAR angle constraints from anchor
   * 4. Raw world point
   */
  const resolvePick = useCallback((
    screen: ScreenPoint,
    anchor: WorldPoint | null,
  ): { point: WorldPoint; snap: SnapResult | null } => {
    const vp = viewportRef.current;
    let world = screenToWorld(screen, vp);
    let snap: SnapResult | null = null;

    if (snapEnabledRef.current) {
      snap = resolveSnap(world, entitiesRef.current, SNAP_MODES, SNAP_APERTURE_PX, vp);
      if (!snap && gridEnabledRef.current) {
        snap = resolveGridSnap(world, GRID_SPACING, SNAP_APERTURE_PX, vp);
      }
    }

    // Object/grid snap magnet: do not let ORTHO/POLAR pull off the snap point
    if (snap) {
      return { point: snap.point, snap };
    }

    if (anchor) {
      if (orthoEnabledRef.current) {
        world = resolveOrtho(anchor, world);
      } else if (polarEnabledRef.current) {
        const track = resolvePolarTrack(anchor, world, POLAR_ANGLES, POLAR_TOLERANCE);
        if (track) world = track.snappedPoint;
      }
    }
    return { point: world, snap: null };
  }, []);

  // ── Derived cursor world position (matches tap placement) ──
  const cursorWorld = useMemo((): WorldPoint | null => {
    if (!cursorScreen) return null;
    const anchor = pickedPoints.length > 0 ? pickedPoints[pickedPoints.length - 1] : null;
    return resolvePick(cursorScreen, anchor).point;
  }, [cursorScreen, pickedPoints, resolvePick, viewport, snapResult, snapEnabled, gridEnabled, orthoEnabled, polarEnabled]);

  // Magnet screen position for AutoSnap marker
  const snapScreen = useMemo((): ScreenPoint | null => {
    if (!snapResult) return null;
    return worldToScreen(snapResult.point, viewport);
  }, [snapResult, viewport]);

  const resolveCursor = useCallback((anchor: WorldPoint | null): WorldPoint | null => {
    if (!cursorScreen) return null;
    return resolvePick(cursorScreen, anchor).point;
  }, [cursorScreen, resolvePick]);

  resolveCursorRef.current = resolveCursor;

  const handleCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    const prev = canvasSizeRef.current;
    if (Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) return;
    const nextSize = { width, height };
    canvasSizeRef.current = nextSize;
    setCanvasSize(nextSize);
    // Recenter on first real layout measurement
    if (Math.abs(prev.width - screenWidth) < 1 && Math.abs(prev.height - (screenHeight - 140)) < 2) {
      viewportRef.current = createDefaultViewport(nextSize);
      commitViewport();
    }
  }, [commitViewport, screenWidth, screenHeight]);

  // ── Entity operations ──
  const addEntity = useCallback((e: CADEntity) => {
    setEntities(prev => {
      pushUndo(prev);
      return [...prev, e];
    });
  }, [pushUndo]);

  const clearEntitySelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSmartDimension = useCallback(() => {
    setSmartDimensionActive(prev => {
      const next = !prev;
      if (next) {
        setActiveTool('select');
        switchMode('entity');
        clearSelection();
        clearEntitySelection();
        setPickedPoints([]);
        setDetectedDimensions([]);
      } else {
        clearSelection();
        clearEntitySelection();
        setDetectedDimensions([]);
      }
      return next;
    });
  }, [switchMode, clearSelection, clearEntitySelection]);

  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(entitiesRef.current.map(e => e.id)));
  }, []);

  const deleteSelected = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === 0) return prev;
      const ids = prev;
      setEntities(ents => {
        pushUndo(ents);
        return ents.filter(e => !ids.has(e.id));
      });
      return new Set();
    });
  }, [pushUndo]);

  const clearAllEntities = useCallback(() => {
    if (entitiesRef.current.length === 0) return;
    Alert.alert(
      'Clear Drawing',
      `Remove all ${entitiesRef.current.length} entities? You can Undo afterward.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setEntities(prev => {
              if (prev.length === 0) return prev;
              pushUndo(prev);
              return [];
            });
            setSelectedIds(new Set());
            setPickedPoints([]);
            setSnapResult(null);
            setCursorScreen(null);
          },
        },
      ],
    );
  }, [pushUndo]);

  const cancelPendingPick = useCallback(() => {
    if (pendingPickRef.current) {
      clearTimeout(pendingPickRef.current.timer);
      pendingPickRef.current = null;
    }
    lastTapRef.current = null;
  }, []);

  const flushPendingPick = useCallback(() => {
    const pending = pendingPickRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingPickRef.current = null;
    lastTapRef.current = null;
    handleToolPickRef.current(pending.tool, pending.point, pending.screen);
  }, []);

  const exitToSelectTool = useCallback(() => {
    cancelPendingPick();
    setActiveTool('select');
    setPickedPoints([]);
    setSelectedIds(new Set());
    setSnapResult(null);
    setCursorScreen(null);
    setShowTextInput(false);
    setMarqueeScreen(null);
  }, [cancelPendingPick]);

  /** One trash control: selection → delete selected; else → clear all (confirm). */
  const handleRemove = useCallback(() => {
    if (selectedIds.size > 0) {
      deleteSelected();
    } else {
      clearAllEntities();
    }
  }, [selectedIds, deleteSelected, clearAllEntities]);

  const undo = useCallback(() => {
    setUndoStack(prevU => {
      if (prevU.length === 0) return prevU;
      const last = prevU[prevU.length - 1];
      setRedoStack(r => [...r, entitiesRef.current]);
      setEntities(last);
      setSelectedIds(new Set());
      return prevU.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack(prevR => {
      if (prevR.length === 0) return prevR;
      const next = prevR[prevR.length - 1];
      setUndoStack(u => [...u, entitiesRef.current]);
      setEntities(next);
      setSelectedIds(new Set());
      return prevR.slice(0, -1);
    });
  }, []);

  // ── Tool selection ──
  const handleToolSelect = useCallback((tool: CADTool) => {
    cancelPendingPick();
    setActiveTool(tool);
    setPickedPoints([]);
    setSelectedIds(new Set());
    setMarqueeScreen(null);
  }, [cancelPendingPick]);

  const exitToSelectToolRef = useRef(exitToSelectTool);
  exitToSelectToolRef.current = exitToSelectTool;

  // ── Get effective cursor point (snapped/constrained) ──
  const getEffectivePoint = useCallback((): WorldPoint | null => {
    const anchor = pickedRef.current.length > 0 ? pickedRef.current[pickedRef.current.length - 1] : null;
    return resolveCursor(anchor);
  }, [resolveCursor]);

  // ── Cursor + snap in one state update (throttled) ──
  const updateCursor = useCallback((screen: ScreenPoint) => {
    const now = performance.now();
    if (now - lastCursorUpdateRef.current < CURSOR_THROTTLE_MS) return;
    lastCursorUpdateRef.current = now;

    const anchor = pickedRef.current.length > 0 ? pickedRef.current[pickedRef.current.length - 1] : null;
    const { snap } = resolvePick(screen, anchor);
    setCursorScreen(screen);
    setSnapResult(snap);
  }, [resolvePick]);

  const beginPinch = useCallback((touches: readonly { locationX: number; locationY: number }[]) => {
    const t0 = touches[0];
    const t1 = touches[1];
    const dist = Math.hypot(t1.locationX - t0.locationX, t1.locationY - t0.locationY);
    pinchStartDistRef.current = Math.max(dist, 1);
    pinchStartViewportRef.current = { ...viewportRef.current };
    pinchStartMidRef.current = {
      x: (t0.locationX + t1.locationX) / 2,
      y: (t0.locationY + t1.locationY) / 2,
    };
    isPinchingRef.current = true;
    isPanningRef.current = true; // suppress tap-on-release
    lastPanPointRef.current = null;
  }, []);

  const resetGesture = useCallback(() => {
    isPinchingRef.current = false;
    isPanningRef.current = false;
    isMarqueeRef.current = false;
    marqueeStartRef.current = null;
    lastPanPointRef.current = null;
    pinchStartDistRef.current = 0;
    pinchStartViewportRef.current = null;
    setMarqueeScreen(null);
  }, []);

  // ── Pan/Zoom PanResponder ──
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,

    onPanResponderGrant: (evt) => {
      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) {
        isMarqueeRef.current = false;
        marqueeStartRef.current = null;
        setMarqueeScreen(null);
        beginPinch(touches);
      } else {
        const { locationX, locationY } = evt.nativeEvent;
        const pt = { x: locationX, y: locationY };
        lastPanPointRef.current = pt;
        isPanningRef.current = false;
        isPinchingRef.current = false;
        isMarqueeRef.current = false;
        pinchStartViewportRef.current = null;
        // Select tool: drag on empty = marquee; two-finger = pan/zoom
        marqueeStartRef.current = activeToolRef.current === 'select' && !smartDimensionActiveRef.current ? pt : null;
      }
    },

    onPanResponderMove: (evt) => {
      const touches = evt.nativeEvent.touches;

      // ── PINCH ZOOM (2 fingers) — start here if 2nd finger arrived after grant ──
      if (touches.length >= 2) {
        if (!pinchStartViewportRef.current) {
          beginPinch(touches);
        }
        const startVp = pinchStartViewportRef.current;
        if (!startVp) return;

        const t0 = touches[0];
        const t1 = touches[1];
        const currentDist = Math.hypot(t1.locationX - t0.locationX, t1.locationY - t0.locationY);
        const factor = currentDist / pinchStartDistRef.current;
        const mid = {
          x: (t0.locationX + t1.locationX) / 2,
          y: (t0.locationY + t1.locationY) / 2,
        };
        // Always apply factor against the pinch-start viewport (stable math)
        let next = zoomAt(pinchStartMidRef.current, factor, startVp);
        // Two-finger pan: follow midpoint drift from pinch start
        next = panBy(
          mid.x - pinchStartMidRef.current.x,
          mid.y - pinchStartMidRef.current.y,
          next,
        );
        viewportRef.current = next;
        scheduleViewportFlush();
        return;
      }

      // Left pinch mode if a finger lifted mid-gesture
      if (isPinchingRef.current) {
        isPinchingRef.current = false;
        pinchStartViewportRef.current = null;
        const { locationX, locationY } = evt.nativeEvent;
        lastPanPointRef.current = { x: locationX, y: locationY };
        return;
      }

      // ── SINGLE FINGER ──
      const { locationX, locationY } = evt.nativeEvent;
      const last = lastPanPointRef.current;
      if (!last) return;

      const dx = locationX - last.x;
      const dy = locationY - last.y;
      const dist = Math.hypot(dx, dy);

      if (!isPanningRef.current && dist > PAN_SLOP_PX) {
        isPanningRef.current = true;
      }

      // Select tool: drag = marquee (pan is two-finger only)
      if (isPanningRef.current && activeToolRef.current === 'select' && marqueeStartRef.current) {
        isMarqueeRef.current = true;
        const start = marqueeStartRef.current;
        setMarqueeScreen({ x0: start.x, y0: start.y, x1: locationX, y1: locationY });
        lastPanPointRef.current = { x: locationX, y: locationY };
        return;
      }

      // Drawing tools: track cursor (throttled)
      if (activeToolRef.current !== 'select') {
        updateCursor({ x: locationX, y: locationY });
        lastPanPointRef.current = { x: locationX, y: locationY };
      }
    },

    onPanResponderRelease: (evt) => {
      commitViewport();

      const wasMarquee = isMarqueeRef.current;
      const wasPanOrPinch = isPanningRef.current || isPinchingRef.current;
      const marqueeStart = marqueeStartRef.current;
      const { locationX, locationY } = evt.nativeEvent;

      // Finish marquee selection before reset clears state
      if (wasMarquee && marqueeStart && activeToolRef.current === 'select' && !smartDimensionActiveRef.current) {
        const crossing = locationX < marqueeStart.x; // R→L = crossing (AutoCAD)
        const ids = entitiesInMarquee(
          entitiesRef.current,
          marqueeStart,
          { x: locationX, y: locationY },
          viewportRef.current,
          crossing,
        );
        setSelectedIds(new Set(ids));
        resetGesture();
        return;
      }

      resetGesture();

      if (wasPanOrPinch) return;

      const tool = activeToolRef.current;
      const tapScreen = { x: locationX, y: locationY };

      if (smartDimensionActiveRef.current) {
        const closestPoint = findClosestSelectablePoint(
          tapScreen,
          entitiesRef.current,
          viewportRef.current,
        );

        if (closestPoint) {
          selectPointForSmartDimension(closestPoint.point);
          setSelectedIds(new Set());
          lastTapRef.current = null;
          return;
        }

        const world = screenToWorld(tapScreen, viewportRef.current);
        let closestId: string | null = null;
        let closestDist = 20 / viewportRef.current.scale;
        for (const e of entitiesRef.current) {
          const d = distEntityToPoint(e, world);
          if (d != null && d < closestDist) {
            closestDist = d;
            closestId = e.id;
          }
        }

        if (closestId) {
          selectEntity(closestId);
          setSelectedIds(new Set([closestId]));
        } else {
          clearSelection();
          clearEntitySelection();
        }
        lastTapRef.current = null;
        return;
      }

      if (tool === 'select') {
        const world = screenToWorld(tapScreen, viewportRef.current);
        let closestId: string | null = null;
        let closestDist = 20 / viewportRef.current.scale;
        for (const e of entitiesRef.current) {
          const d = distEntityToPoint(e, world);
          if (d != null && d < closestDist) {
            closestDist = d;
            closestId = e.id;
          }
        }
        if (closestId) {
          toggleSelectId(closestId);
        } else {
          clearEntitySelection();
        }
        lastTapRef.current = null;
        return;
      }

      // Double-tap (same spot) while drawing → cancel pending pick, return to Select
      if (pendingPickRef.current) {
        const prevTap = lastTapRef.current;
        if (
          prevTap
          && Date.now() - prevTap.t <= DOUBLE_TAP_MS
          && Math.hypot(locationX - prevTap.x, locationY - prevTap.y) <= DOUBLE_TAP_PX
        ) {
          exitToSelectToolRef.current();
          return;
        }
        // Different location: commit the first tap, then queue this one
        flushPendingPick();
      }

      const anchor = pickedRef.current.length > 0 ? pickedRef.current[pickedRef.current.length - 1] : null;
      const { point: effectivePoint, snap } = resolvePick(tapScreen, anchor);
      setCursorScreen(tapScreen);
      setSnapResult(snap);

      // Defer place so a quick second tap on the same spot can exit cleanly
      lastTapRef.current = { t: Date.now(), x: locationX, y: locationY };
      const pickTool = tool;
      const pickPoint = effectivePoint;
      const pickScreen = tapScreen;
      const timer = setTimeout(() => {
        pendingPickRef.current = null;
        lastTapRef.current = null;
        handleToolPickRef.current(pickTool, pickPoint, pickScreen);
      }, DOUBLE_TAP_MS);
      pendingPickRef.current = { tool: pickTool, point: pickPoint, screen: pickScreen, timer };
    },

    onPanResponderTerminate: () => {
      commitViewport();
      resetGesture();
    },
  }), [beginPinch, clearEntitySelection, clearSelection, commitViewport, flushPendingPick, resetGesture, resolvePick, scheduleViewportFlush, selectEntity, selectPointForSmartDimension, toggleSelectId, updateCursor]);

  // ── Handle tool point pick ──
  const handleToolPick = useCallback((tool: CADTool, point: WorldPoint, screen: ScreenPoint) => {
    switch (tool) {
      case 'line': {
        const newPicked = [...pickedRef.current, point];
        if (newPicked.length >= 2) {
          // Create line segment and continue chain
          const a = newPicked[newPicked.length - 2];
          const b = newPicked[newPicked.length - 1];
          if (distPoints(a, b) > 0.001) {
            addEntity(createLine(a, b, 'MARK'));
          }
          // Keep last point as new anchor for chain
          setPickedPoints([b]);
        } else {
          setPickedPoints(newPicked);
        }
        break;
      }

      case 'polyline': {
        const newPicked = [...pickedRef.current, point];
        setPickedPoints(newPicked);
        break;
      }

      case 'circle': {
        const newPicked = [...pickedRef.current, point];
        if (newPicked.length === 2) {
          const radius = distPoints(newPicked[0], newPicked[1]);
          if (radius > 0.001) {
            addEntity(createCircle(newPicked[0], radius, 'MARK'));
          }
          setPickedPoints([]);
        } else {
          setPickedPoints(newPicked);
        }
        break;
      }

      case 'arc': {
        const newPicked = [...pickedRef.current, point];
        if (newPicked.length === 3) {
          addEntity(createArc3Point(newPicked[0], newPicked[1], newPicked[2], 'MARK'));
          setPickedPoints([]);
        } else {
          setPickedPoints(newPicked);
        }
        break;
      }

      case 'rectangle': {
        const newPicked = [...pickedRef.current, point];
        if (newPicked.length === 2) {
          addEntity(createRectangle(newPicked[0], newPicked[1], 'MARK'));
          setPickedPoints([]);
        } else {
          setPickedPoints(newPicked);
        }
        break;
      }

      case 'point': {
        addEntity(createPoint(point, 'MARK'));
        setPickedPoints([]);
        break;
      }

      case 'text': {
        // Show text input dialog
        setPickedPoints([point]);
        setShowTextInput(true);
        setTextInputValue('');
        break;
      }
    }
  }, [addEntity]);

  handleToolPickRef.current = handleToolPick;

  // ── Text input submit ──
  const handleTextSubmit = useCallback(() => {
    if (!textInputValue.trim() || pickedRef.current.length === 0) {
      setShowTextInput(false);
      return;
    }
    addEntity(createText(pickedRef.current[0], textInputValue.trim(), 1, 0, 'TEXT'));
    setShowTextInput(false);
    setTextInputValue('');
    setPickedPoints([]);
  }, [addEntity, textInputValue]);

  // ── Finish polyline ──
  const finishPolyline = useCallback(() => {
    if (activeTool === 'polyline' && pickedPoints.length >= 2) {
      addEntity(createPolyline(pickedPoints, false, 'MARK'));
    }
    setPickedPoints([]);
  }, [activeTool, pickedPoints, addEntity]);

  // ── Cancel current tool operation ──
  const cancelTool = useCallback(() => {
    setPickedPoints([]);
    setShowTextInput(false);
  }, []);

  // ── Command bar submit ──
  const handleCommandSubmit = useCallback((text: string) => {
    const parsed = parseCADInput(text, pickedRef.current.length > 0 ? pickedRef.current[pickedRef.current.length - 1] : null);
    const tool = activeToolRef.current;

    if (parsed.kind === 'command') {
      if (parsed.name === 'cancel' || parsed.name === 'enter') {
        cancelTool();
      }
      return;
    }

    const point = resolveParsedInput(
      parsed,
      pickedRef.current.length > 0 ? pickedRef.current[pickedRef.current.length - 1] : null,
      cursorWorld ? angleDeg(pickedRef.current[pickedRef.current.length - 1] ?? cursorWorld, cursorWorld) : null,
    );
    if (point && tool !== 'select') {
      handleToolPick(tool, point, cursorScreen ?? { x: 0, y: 0 });
    }
  }, [cursorWorld, cursorScreen, cancelTool, handleToolPick]);

  // ── Zoom controls ──
  const handleZoomIn = useCallback(() => {
    const center = { x: canvasSizeRef.current.width / 2, y: canvasSizeRef.current.height / 2 };
    viewportRef.current = zoomAt(center, 1.25, viewportRef.current);
    commitViewport();
  }, [commitViewport]);

  const handleZoomOut = useCallback(() => {
    const center = { x: canvasSizeRef.current.width / 2, y: canvasSizeRef.current.height / 2 };
    viewportRef.current = zoomAt(center, 0.8, viewportRef.current);
    commitViewport();
  }, [commitViewport]);

  const handleZoomExtents = useCallback(() => {
    if (entitiesRef.current.length === 0) {
      viewportRef.current = createDefaultViewport(canvasSizeRef.current);
    } else {
      const bounds = entitiesBounds(entitiesRef.current);
      viewportRef.current = computeFitViewport(bounds, canvasSizeRef.current, 60);
    }
    commitViewport();
  }, [commitViewport]);

  // ── Save (DXF export) ──
  const handleSave = useCallback(() => {
    if (entities.length === 0) {
      Alert.alert('No Drawing', 'Draw something before saving.');
      return;
    }
    const dxf = entitiesToDXF(entities, [], units);
    setPendingSaveDXF({ dxfContent: dxf, entities });
  }, [entities, units]);

  const handleSaveChoice = useCallback((importMode: 'waypoints' | 'entities') => {
    if (!pendingSaveDXF) return;
    if (onSaveDXF) {
      onSaveDXF(pendingSaveDXF.dxfContent, pendingSaveDXF.entities, importMode);
    }
    setPendingSaveDXF(null);
    onClose();
  }, [pendingSaveDXF, onSaveDXF, onClose]);

  const handleSaveDxfFile = useCallback(() => {
    if (!pendingSaveDXF) return;

    // Generate default filename based on timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultFilename = `cad-drawing-${timestamp}`;

    setFilenameInput(defaultFilename);
    setShowFilenameInput(true);
  }, [pendingSaveDXF]);

  const handleFilenameSubmit = useCallback(async () => {
    if (!pendingSaveDXF || !filenameInput.trim()) {
      setShowFilenameInput(false);
      return;
    }

    try {
      const filename = filenameInput.trim() || 'cad-drawing';
      const success = await saveDxfFileToDevice(pendingSaveDXF.dxfContent, filename);

      if (success) {
        console.log('[CADDrawingCanvas] DXF file saved successfully');
        setPendingSaveDXF(null);
        setShowFilenameInput(false);
        onClose();
      }
    } catch (error) {
      console.error('[CADDrawingCanvas] Failed to save DXF file:', error);
      // Don't close the dialog on error, let user try again
    }
  }, [pendingSaveDXF, filenameInput, onClose]);

  const handleFilenameCancel = useCallback(() => {
    setShowFilenameInput(false);
    setFilenameInput('');
  }, []);

  const handleClose = useCallback(() => {
    setPendingSaveDXF(null);
    onClose();
  }, [onClose]);

  // ── Prompt text ──
  const prompt = useMemo(() => {
    if (smartDimensionActive) {
      if (selectedPoints.length === 0 && selectedEntitiesSet.size === 0) {
        return 'Smart Dimension: tap entity for size, or tap two points for distance';
      }
      if (selectedPoints.length === 1) {
        return 'Smart Dimension: tap second point for distance constraint';
      }
      if (selectedPoints.length === 2 && detectedDimensions.length > 0) {
        return `${detectedDimensions.length} dimension(s) — tap label to edit value`;
      }
      if (selectedEntitiesSet.size > 0 && detectedDimensions.length > 0) {
        return `${detectedDimensions.length} dimension(s) — tap label to edit; connected geometry updates`;
      }
      return 'Smart Dimension active — tap entity or points';
    }

    // Selection mode prompts take priority
    if (selectionMode === 'point-pair') {
      if (selectedPoints.length === 0) {
        return 'Point-Pair Mode: Select first point — tap any vertex/center/endpoint';
      } else if (selectedPoints.length === 1) {
        return 'Point-Pair Mode: Select second point — tap any vertex/center/endpoint';
      } else if (detectedDimensions.length > 0) {
        return `${detectedDimensions.length} dimensions detected — tap dimension to edit`;
      }
    } else if (selectionMode === 'point') {
      if (selectedPoints.length === 0) {
        return 'Point Mode: Select points — tap any vertex/center/endpoint';
      } else {
        return `${selectedPoints.length} point(s) selected — tap dimension to edit`;
      }
    }

    // Tool-specific prompts
    switch (activeTool) {
      case 'line': return pickedPoints.length === 0 ? 'LINE: first point — double-tap to exit' : 'LINE: next point — double-tap to exit';
      case 'polyline': return pickedPoints.length === 0 ? 'PLINE: start point — double-tap to exit' : `PLINE: next (${pickedPoints.length} pts) — Finish or double-tap to exit`;
      case 'circle': return pickedPoints.length === 0 ? 'CIRCLE: center — double-tap to exit' : 'CIRCLE: radius — double-tap to exit';
      case 'arc': return pickedPoints.length === 0 ? 'ARC: start — double-tap to exit' : pickedPoints.length === 1 ? 'ARC: second point — double-tap to exit' : 'ARC: end — double-tap to exit';
      case 'rectangle': return pickedPoints.length === 0 ? 'RECT: first corner — double-tap to exit' : 'RECT: opposite corner — double-tap to exit';
      case 'point': return 'POINT: location — double-tap to exit';
      case 'text': return 'TEXT: insertion point — double-tap to exit';
      case 'select': {
        const n = selectedIds.size;
        if (n > 0) return `Select: ${n} selected — trash removes selection, pinch to pan/zoom`;
        return 'Select: tap toggle, drag box, trash clears all, pinch to pan/zoom';
      }
      default: return '';
    }
  }, [activeTool, pickedPoints, selectedIds, smartDimensionActive, selectionMode, selectedPoints, selectedEntitiesSet, detectedDimensions]);

  // ── Preview entity during drawing ──
  const previewEntity = useMemo((): CADEntity | null => {
    if (!cursorWorld || pickedPoints.length === 0) return null;
    const anchor = pickedPoints[pickedPoints.length - 1];
    const effective = resolveCursor(anchor);
    if (!effective) return null;

    switch (activeTool) {
      case 'line':
        return { type: 'Line', id: 'preview', layer: 'MARK', start: anchor, end: effective };
      case 'circle':
        return { type: 'Circle', id: 'preview', layer: 'MARK', center: anchor, radius: Math.max(0.001, distPoints(anchor, effective)) };
      case 'rectangle':
        return { type: 'Rectangle', id: 'preview', layer: 'MARK', corner1: anchor, corner2: effective };
      case 'polyline':
        if (pickedPoints.length >= 1) {
          return { type: 'Line', id: 'preview', layer: 'MARK', start: anchor, end: effective };
        }
        return null;
      default:
        return null;
    }
  }, [cursorWorld, pickedPoints, activeTool, resolveCursor]);

  // ── Dynamic input tooltip ──
  const dynamicInfo = useMemo(() => {
    if (!cursorWorld || pickedPoints.length === 0) return null;
    const anchor = pickedPoints[pickedPoints.length - 1];
    const effective = resolveCursor(anchor);
    if (!effective) return null;
    const d = distPoints(anchor, effective);
    const a = angleDeg(anchor, effective);
    return { d, a };
  }, [cursorWorld, pickedPoints, resolveCursor]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* ── Top Toolbar ── */}
        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
            <Text style={styles.toolbarTitle}>CAD Drawing</Text>
          </View>
          <View style={styles.toolbarCenter}>
            {TOOLS.map(tool => (
              <TouchableOpacity
                key={tool.name}
                style={[styles.toolBtn, activeTool === tool.name && styles.toolBtnActive]}
                onPress={() => handleToolSelect(tool.name)}
              >
                <MaterialCommunityIcons
                  name={tool.icon as any}
                  size={18}
                  color={activeTool === tool.name ? colors.accent : colors.textSecondary}
                />
                <Text style={[styles.toolBtnText, activeTool === tool.name && styles.toolBtnTextActive]}>
                  {tool.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.toolbarRight}>
            <TouchableOpacity
              style={[styles.smartDimBtn, smartDimensionActive && styles.smartDimBtnActive]}
              onPress={toggleSmartDimension}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="ruler-square"
                size={18}
                color={smartDimensionActive ? '#0B1220' : colors.accent}
              />
              <Text style={[styles.smartDimBtnText, smartDimensionActive && styles.smartDimBtnTextActive]}>
                Smart Dim
              </Text>
            </TouchableOpacity>
            {activeTool === 'select' && entities.length > 0 && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => {
                  if (selectedIds.size === entities.length) clearEntitySelection();
                  else selectAll();
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MaterialCommunityIcons
                  name={selectedIds.size === entities.length ? 'select-off' : 'select-all'}
                  size={20}
                  color={colors.accent}
                />
              </TouchableOpacity>
            )}
            {entities.length > 0 && (
              <TouchableOpacity
                style={[styles.iconBtn, selectedIds.size > 0 ? styles.iconBtnDanger : styles.iconBtnWarn]}
                onPress={handleRemove}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MaterialCommunityIcons
                  name="delete-outline"
                  size={20}
                  color={selectedIds.size > 0 ? '#EF4444' : '#F59E0B'}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.toolBtn, !undoStack.length && styles.toolBtnDisabled]}
              onPress={undo}
              disabled={!undoStack.length}
            >
              <MaterialCommunityIcons name="undo" size={18} color={undoStack.length ? colors.accent : colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtn, !redoStack.length && styles.toolBtnDisabled]}
              onPress={redo}
              disabled={!redoStack.length}
            >
              <MaterialCommunityIcons name="redo" size={18} color={redoStack.length ? colors.accent : colors.textMuted} />
            </TouchableOpacity>
            {activeTool === 'polyline' && pickedPoints.length >= 2 && (
              <TouchableOpacity style={styles.finishBtn} onPress={finishPolyline}>
                <MaterialCommunityIcons name="check-bold" size={16} color={colors.greenBtn} />
                <Text style={styles.finishBtnText}>Finish</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <MaterialCommunityIcons name="content-save-outline" size={18} color={colors.text} />
              <Text style={styles.saveBtnText}>Save DXF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <MaterialCommunityIcons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Drafting Toggles ── */}
        <View style={styles.draftBar}>
          <TouchableOpacity
            style={[styles.draftBtn, snapEnabled && styles.draftBtnActive]}
            onPress={() => {
              setSnapEnabled(prev => {
                if (prev) setSnapResult(null);
                return !prev;
              });
            }}
          >
            <Text style={[styles.draftBtnText, snapEnabled && styles.draftBtnTextActive]}>SNAP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.draftBtn, gridEnabled && styles.draftBtnActive]}
            onPress={() => setGridEnabled(!gridEnabled)}
          >
            <Text style={[styles.draftBtnText, gridEnabled && styles.draftBtnTextActive]}>GRID</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.draftBtn, orthoEnabled && styles.draftBtnActive]}
            onPress={() => setOrthoEnabled(!orthoEnabled)}
          >
            <Text style={[styles.draftBtnText, orthoEnabled && styles.draftBtnTextActive]}>ORTHO</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.draftBtn, polarEnabled && styles.draftBtnActive]}
            onPress={() => setPolarEnabled(!polarEnabled)}
          >
            <Text style={[styles.draftBtnText, polarEnabled && styles.draftBtnTextActive]}>POLAR</Text>
          </TouchableOpacity>
          {!smartDimensionActive && (
          <View style={styles.selectionModeGroup}>
            <TouchableOpacity
              style={[styles.draftBtn, selectionMode === 'entity' && styles.draftBtnActive]}
              onPress={() => switchMode('entity')}
            >
              <Text style={[styles.draftBtnText, selectionMode === 'entity' && styles.draftBtnTextActive]}>Entity</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.draftBtn, selectionMode === 'point' && styles.draftBtnActive]}
              onPress={() => switchMode('point')}
            >
              <Text style={[styles.draftBtnText, selectionMode === 'point' && styles.draftBtnTextActive]}>Point</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.draftBtn, selectionMode === 'point-pair' && styles.draftBtnActive]}
              onPress={() => switchMode('point-pair')}
            >
              <Text style={[styles.draftBtnText, selectionMode === 'point-pair' && styles.draftBtnTextActive]}>Pair</Text>
            </TouchableOpacity>
          </View>
          )}
          {dynamicInfo && (
            <View style={styles.dynamicInfo}>
              <Text style={styles.dynamicInfoText}>
                {dynamicInfo.d.toFixed(2)}{UNIT_LABEL[units]} | {dynamicInfo.a.toFixed(1)} deg
              </Text>
            </View>
          )}
        </View>

        {/* ── Canvas: gestures on canvas only; zoom buttons are a higher-z sibling ── */}
        <View style={styles.canvasWrapper} pointerEvents="box-none">
          <View
            style={styles.canvas}
            onLayout={handleCanvasLayout}
            {...panResponder.panHandlers}
          >
            <Svg width={canvasSize.width} height={canvasSize.height} style={styles.svg}>
              {gridEnabled && (
                <CADGrid
                  viewport={viewport}
                  canvasSize={canvasSize}
                  spacing={1}
                  majorEveryN={10}
                  showAxes={true}
                />
              )}

              <CADUCSIcon viewport={viewport} canvasSize={canvasSize} />

              <G>
                {entities.map(e => (
                  <CADEntityRenderer
                    key={e.id}
                    entity={e}
                    viewport={viewport}
                    layers={CANVAS_LAYERS}
                    isSelected={selectedIds.has(e.id) || selectedEntitiesSet.has(e.id)}
                  />
                ))}
                {previewEntity && (
                  <CADEntityRenderer
                    entity={previewEntity}
                    viewport={viewport}
                    layers={PREVIEW_LAYERS}
                    isSelected={false}
                  />
                )}
              </G>

              {/* Marquee selection rectangle */}
              {marqueeScreen && (
                <SvgRect
                  x={Math.min(marqueeScreen.x0, marqueeScreen.x1)}
                  y={Math.min(marqueeScreen.y0, marqueeScreen.y1)}
                  width={Math.abs(marqueeScreen.x1 - marqueeScreen.x0)}
                  height={Math.abs(marqueeScreen.y1 - marqueeScreen.y0)}
                  fill={marqueeScreen.x1 < marqueeScreen.x0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.12)'}
                  stroke={marqueeScreen.x1 < marqueeScreen.x0 ? '#3B82F6' : '#F59E0B'}
                  strokeWidth={1}
                  strokeDasharray={marqueeScreen.x1 < marqueeScreen.x0 ? '4 3' : undefined}
                />
              )}

              <G pointerEvents="none">
                {pickedPoints.map((p, i) => {
                  const sp = worldToScreen(p, viewport);
                  return (
                    <G key={`pick-${i}`}>
                      <SvgLine x1={sp.x - 6} y1={sp.y} x2={sp.x + 6} y2={sp.y} stroke="#F59E0B" strokeWidth={1.5} />
                      <SvgLine x1={sp.x} y1={sp.y - 6} x2={sp.x} y2={sp.y + 6} stroke="#F59E0B" strokeWidth={1.5} />
                    </G>
                  );
                })}
              </G>

              {/* Point Markers for Selection */}
              {(smartDimensionActive || selectionMode === 'point' || selectionMode === 'point-pair') && (
                <CADPointMarkers
                  markers={pointMarkers}
                  viewport={viewport}
                  onMarkerPress={handleMarkerPress}
                  onMarkerHover={handleMarkerHover}
                />
              )}

              {/* Dimension Annotations */}
              {detectedDimensions.map(dimension => (
                <CADimensionAnnotation
                  key={dimension.id}
                  dimension={dimension}
                  viewport={viewport}
                  canvasSize={canvasSize}
                  onPress={handleDimensionPress}
                />
              ))}

              <CADCursorOverlay
                cursorScreen={cursorScreen}
                snapResult={snapResult}
                snapScreen={snapScreen}
                canvasWidth={canvasSize.width}
                canvasHeight={canvasSize.height}
                isDrawing={pickedPoints.length > 0}
              />
            </Svg>
          </View>

          {/* Zoom controls — sibling above canvas so PanResponder cannot steal presses */}
          <View style={styles.zoomControls}>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={handleZoomIn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={handleZoomOut}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="minus" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={handleZoomExtents}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="fit-to-screen-outline" size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.zoomLabel}>{Math.round(viewport.scale)} px/{UNIT_LABEL[units]}</Text>
          </View>

          {/* Text input dialog */}
          {showTextInput && (
            <View style={styles.textDialog}>
              <View style={styles.textCard}>
                <Text style={styles.textTitle}>Enter Text</Text>
                <TextInput
                  style={styles.textInput}
                  value={textInputValue}
                  onChangeText={setTextInputValue}
                  placeholder="Type annotation text..."
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleTextSubmit}
                />
                <View style={styles.textActions}>
                  <TouchableOpacity onPress={() => { setShowTextInput(false); setPickedPoints([]); }}>
                    <Text style={styles.textCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleTextSubmit}>
                    <Text style={styles.textConfirm}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Filename input dialog */}
          {showFilenameInput && (
            <View style={styles.textDialog}>
              <View style={styles.textCard}>
                <Text style={styles.textTitle}>Save DXF File</Text>
                <Text style={styles.textSubtitle}>Enter filename (without .dxf extension)</Text>
                <TextInput
                  style={styles.textInput}
                  value={filenameInput}
                  onChangeText={setFilenameInput}
                  placeholder="drawing-name"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleFilenameSubmit}
                />
                <View style={styles.textActions}>
                  <TouchableOpacity onPress={handleFilenameCancel}>
                    <Text style={styles.textCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleFilenameSubmit}>
                    <Text style={styles.textConfirm}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {pendingSaveDXF && (
            <View style={styles.saveChoiceOverlay} pointerEvents="box-none">
              <View style={styles.saveChoiceCard}>
                <View style={styles.saveChoiceHeader}>
                  <View style={styles.saveChoiceIcon}>
                    <MaterialCommunityIcons name="file-cad" size={20} color="#67E8F9" />
                  </View>
                  <View style={styles.saveChoiceTitleWrap}>
                    <Text style={styles.saveChoiceTitle}>Save Drawing</Text>
                    <Text style={styles.saveChoiceSubtitle}>
                      Choose how to save this DXF drawing.
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.saveChoiceClose} onPress={() => setPendingSaveDXF(null)} activeOpacity={0.7}>
                    <MaterialCommunityIcons name="close" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.saveChoiceOption} onPress={handleSaveDxfFile} activeOpacity={0.78}>
                  <MaterialCommunityIcons name="download" size={22} color="#67E8F9" />
                  <View style={styles.saveChoiceOptionText}>
                    <Text style={styles.saveChoiceOptionTitle}>Save as DXF File</Text>
                    <Text style={styles.saveChoiceOptionSub}>Download the drawing to your device storage.</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#64748B" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.saveChoiceOption} onPress={() => handleSaveChoice('waypoints')} activeOpacity={0.78}>
                  <MaterialCommunityIcons name="map-marker-path" size={22} color="#67E8F9" />
                  <View style={styles.saveChoiceOptionText}>
                    <Text style={styles.saveChoiceOptionTitle}>Import Waypoints</Text>
                    <Text style={styles.saveChoiceOptionSub}>Convert drawing vertices into mission points.</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#64748B" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.saveChoiceOption} onPress={() => handleSaveChoice('entities')} activeOpacity={0.78}>
                  <MaterialCommunityIcons name="vector-polyline" size={22} color="#67E8F9" />
                  <View style={styles.saveChoiceOptionText}>
                    <Text style={styles.saveChoiceOptionTitle}>Import Entities</Text>
                    <Text style={styles.saveChoiceOptionSub}>Render lines, arcs, points, and labels as shapes.</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Dimension Editor Dialog */}
          <CADimensionEditor
            visible={dimensionEditorVisible}
            dimension={editingDimension}
            entities={entities}
            onApply={handleDimensionEditApply}
            onCancel={handleDimensionEditCancel}
          />
        </View>

        {/* Command Bar */}
        <CADCommandBar
          prompt={prompt}
          onSubmit={handleCommandSubmit}
          onEscape={cancelTool}
        />
      </View>
    </Modal>
  );
};

// ============================================================
// Marquee selection (AutoCAD-style window / crossing)
// ============================================================
// L→R (x1 >= x0): window — entity fully inside
// R→L (x1 < x0): crossing — entity bounds intersect box

function entitiesInMarquee(
  entities: CADEntity[],
  start: ScreenPoint,
  end: ScreenPoint,
  vp: Viewport,
  crossing: boolean,
): string[] {
  const a = screenToWorld(start, vp);
  const b = screenToWorld(end, vp);
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  const ids: string[] = [];
  for (const e of entities) {
    const box = entityBounds(e);
    if (crossing) {
      const intersects = !(
        box.maxX < minX || box.minX > maxX || box.maxY < minY || box.minY > maxY
      );
      if (intersects) ids.push(e.id);
    } else {
      const inside =
        box.minX >= minX && box.maxX <= maxX && box.minY >= minY && box.maxY <= maxY;
      if (inside) ids.push(e.id);
    }
  }
  return ids;
}

// ============================================================
// Helper: distance from entity to a world point
// ============================================================
function distEntityToPoint(e: CADEntity, p: WorldPoint): number | null {
  switch (e.type) {
    case 'Line': {
      // Distance from point to line segment
      const foot = perpFoot(p, e.start, e.end);
      if (!foot) return null;
      return Math.hypot(p.x - foot.x, p.y - foot.y);
    }
    case 'Circle': {
      const cDist = Math.hypot(p.x - e.center.x, p.y - e.center.y);
      return Math.abs(cDist - e.radius);
    }
    case 'Point':
      return Math.hypot(p.x - e.position.x, p.y - e.position.y);
    case 'Rectangle': {
      // Check distance to nearest edge
      const c1 = e.corner1, c2 = e.corner2;
      const minX = Math.min(c1.x, c2.x), maxX = Math.max(c1.x, c2.x);
      const minY = Math.min(c1.y, c2.y), maxY = Math.max(c1.y, c2.y);
      const edges = [
        [{ x: minX, y: minY }, { x: maxX, y: minY }],
        [{ x: maxX, y: minY }, { x: maxX, y: maxY }],
        [{ x: maxX, y: maxY }, { x: minX, y: maxY }],
        [{ x: minX, y: maxY }, { x: minX, y: minY }],
      ];
      let minDist = Infinity;
      for (const [a, b] of edges) {
        const foot = perpFoot(p, a, b);
        if (foot) {
          const d = Math.hypot(p.x - foot.x, p.y - foot.y);
          if (d < minDist) minDist = d;
        }
      }
      return minDist === Infinity ? null : minDist;
    }
    case 'Polyline': {
      let minDist = Infinity;
      for (let i = 0; i < e.vertices.length - 1; i++) {
        const foot = perpFoot(p, e.vertices[i], e.vertices[i + 1]);
        if (foot) {
          const d = Math.hypot(p.x - foot.x, p.y - foot.y);
          if (d < minDist) minDist = d;
        }
      }
      return minDist === Infinity ? null : minDist;
    }
    case 'Text':
      return Math.hypot(p.x - e.position.x, p.y - e.position.y);
    case 'Arc': {
      const cDist = Math.hypot(p.x - e.center.x, p.y - e.center.y);
      return Math.abs(cDist - e.radius);
    }
    default:
      return null;
  }
}

function perpFoot(p: WorldPoint, a: WorldPoint, b: WorldPoint): WorldPoint | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return null;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const tc = Math.max(0, Math.min(1, t));
  return { x: a.x + tc * dx, y: a.y + tc * dy };
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1D24',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2D34',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toolbarLeft: {
    minWidth: 80,
  },
  toolbarTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  toolbarCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    justifyContent: 'center',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
    justifyContent: 'flex-end',
  },
  toolBtn: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#252830',
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 44,
  },
  toolBtnActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: colors.greenBtn,
  },
  toolBtnText: {
    fontSize: 8,
    color: colors.textSecondary,
    marginTop: 2,
  },
  toolBtnTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  toolBtnDisabled: {
    opacity: 0.4,
  },
  smartDimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.35)',
    backgroundColor: 'rgba(103, 232, 249, 0.08)',
    marginRight: 4,
  },
  smartDimBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  smartDimBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  smartDimBtnTextActive: {
    color: '#0B1220',
  },
  iconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#252830',
    borderWidth: 1,
    borderColor: '#2A2D34',
  },
  iconBtnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
  },
  iconBtnWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: '#F59E0B',
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: colors.greenBtn,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  finishBtnText: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.greenBtn,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.greenBtn,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 3,
  },
  saveBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
  },
  closeBtn: {
    backgroundColor: colors.redBtn,
    padding: 6,
    borderRadius: 6,
  },
  draftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A1D24',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2D34',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  draftBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#252830',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  draftBtnActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: colors.greenBtn,
  },
  draftBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  draftBtnTextActive: {
    color: colors.greenBtn,
  },
  dynamicInfo: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  dynamicInfoText: {
    fontSize: 10,
    color: colors.accent,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  canvasWrapper: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  canvas: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  svg: {
    backgroundColor: 'transparent',
  },
  zoomControls: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 20,
    elevation: 20,
    backgroundColor: '#1A1D24',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2D34',
    padding: 4,
    gap: 2,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: '#252830',
  },
  zoomLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  textDialog: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  textCard: {
    backgroundColor: '#1A1D24',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    padding: 16,
    width: 280,
  },
  textTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: 10,
  },
  textSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#252830',
    borderWidth: 1,
    borderColor: '#2A2D34',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  textActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  textCancel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  textConfirm: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.greenBtn,
  },
  saveChoiceOverlay: {
    position: 'absolute',
    top: 74,
    right: 14,
    width: 320,
    zIndex: 30,
    elevation: 30,
  },
  saveChoiceCard: {
    backgroundColor: 'rgba(7, 17, 27, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.32)',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  saveChoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  saveChoiceIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(103, 232, 249, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.24)',
  },
  saveChoiceTitleWrap: {
    flex: 1,
  },
  saveChoiceTitle: {
    color: '#E5F1FF',
    fontSize: 13,
    fontWeight: '800',
  },
  saveChoiceSubtitle: {
    color: '#94A3B8',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  saveChoiceClose: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  saveChoiceOption: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.16)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    marginTop: 8,
  },
  saveChoiceOptionText: {
    flex: 1,
  },
  saveChoiceOptionTitle: {
    color: '#E5F1FF',
    fontSize: 12,
    fontWeight: '800',
  },
  saveChoiceOptionSub: {
    color: '#94A3B8',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 3,
  },
  selectionModeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
  },
});
