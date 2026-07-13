import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  PanResponder,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons, Fontisto } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { parseDXF } from '../../core/parser/dxfParser';
import {
  computeBoundingBox,
  scaleToViewport,
  estimateMetersPerPixel,
} from '../../core/transform';

/** A 2D point in the local DESIGN frame, units in metres. */
export interface DesignPoint {
  /** Right from canvas center, in metres */
  x: number;
  /** Up from canvas center, in metres */
  y: number;
}

interface CADDrawingCanvasProps {
  visible: boolean;
  onClose: () => void;
  onSaveDesignPoints: (points: DesignPoint[]) => void;
  onImportDXF?: (entities: CADEntity[]) => void;
  onShowSurveyGrid?: () => void;
}

// m1: Separate CADTool (toolbar) from CADEntityType (entity data)
type CADTool =
  | 'select' | 'line' | 'rectangle' | 'circle' | 'arc'
  | 'spline' | 'point' | 'text' | 'polygon' | 'ellipse' | 'dimension';

type CADEntityType = 'line' | 'rectangle' | 'circle' | 'arc'
  | 'spline' | 'point' | 'text' | 'polygon' | 'ellipse' | 'dimension';

interface CADEntity {
  id: string;
  type: CADEntityType;
  points: Array<{ x: number; y: number }>;
  properties?: Record<string, unknown>;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Approximate meters per pixel at the equator for GPS conversion.
// This is used for on-screen drawings where 1 pixel ≈ this many meters.
// The value 0.5 means each pixel represents ~0.5m, suitable for field-scale drawings.
const DEFAULT_METERS_PER_PIXEL = 0.5;

// ── Line Tool Precision Utilities ─────────────────────────────

const ORTHO_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const ORTHO_SNAP_THRESHOLD_DEG = 5;
const ENTITY_SNAP_THRESHOLD_PX = 15;
const TAP_THRESHOLD_PX = 10;
const DOUBLE_TAP_MS = 400;
const MIN_SEGMENT_PX = 2;

function snapToOrtho(dx: number, dy: number): { x: number; y: number; snappedAngle: number | null } {
  const bearingRad = Math.atan2(dy, dx);
  const bearingDeg = ((bearingRad * 180 / Math.PI) + 360) % 360;
  const dist = Math.sqrt(dx * dx + dy * dy);
  for (const angle of ORTHO_ANGLES) {
    let diff = Math.abs(bearingDeg - angle);
    if (diff > 180) diff = 360 - diff;
    if (diff < ORTHO_SNAP_THRESHOLD_DEG) {
      const rad = angle * Math.PI / 180;
      return { x: dist * Math.cos(rad), y: dist * Math.sin(rad), snappedAngle: angle };
    }
  }
  return { x: dx, y: dy, snappedAngle: null };
}

function findNearestEntityPoint(
  canvasX: number, canvasY: number, entities: CADEntity[], excludeEntityId?: string,
): { x: number; y: number } | null {
  let closest: { x: number; y: number } | null = null;
  let closestDist = ENTITY_SNAP_THRESHOLD_PX;
  for (const entity of entities) {
    if (entity.id === excludeEntityId) continue;
    for (const pt of entity.points) {
      const dist = Math.hypot(pt.x - canvasX, pt.y - canvasY);
      if (dist < closestDist) { closestDist = dist; closest = { x: pt.x, y: pt.y }; }
    }
  }
  return closest;
}

function canvasBearingDeg(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angle = Math.atan2(-dy, dx) * (180 / Math.PI);
  return (angle + 360) % 360;
}

function computeLiveMeasurement(
  anchor: { x: number; y: number }, cursor: { x: number; y: number }, mpp: number,
): { distance: number; bearing: number; position: { x: number; y: number } } {
  const pixelDist = Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y);
  return {
    distance: pixelDist * mpp,
    bearing: canvasBearingDeg(anchor, cursor),
    position: { x: (anchor.x + cursor.x) / 2, y: (anchor.y + cursor.y) / 2 - 16 },
  };
}

// M5: Memoized grid — pre-computed once, never re-renders
const MemoizedGrid = React.memo(() => (
  <View style={styles.grid}>
    {Array.from({ length: 20 }, (_, i) => (
      <View key={`h-${i}`} style={[styles.gridLine, { top: (i * screenHeight) / 20, left: 0, right: 0, height: 1 }]} />
    ))}
    {Array.from({ length: 20 }, (_, i) => (
      <View key={`v-${i}`} style={[styles.gridLine, { left: (i * screenWidth) / 20, top: 0, bottom: 0, width: 1 }]} />
    ))}
  </View>
));

export const CADDrawingCanvas: React.FC<CADDrawingCanvasProps> = ({
  visible,
  onClose,
  onSaveDesignPoints,
  onImportDXF,
  onShowSurveyGrid,
}) => {
  const [activeTool, setActiveTool] = useState<CADTool>('select');
  const [entities, setEntities] = useState<CADEntity[]>([]);
  const [undoStack, setUndoStack] = useState<CADEntity[][]>([]);
  const [redoStack, setRedoStack] = useState<CADEntity[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [currentPath, setCurrentPath] = useState<Array<{ x: number; y: number }>>([]);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [metersPerPixel, setMetersPerPixel] = useState(DEFAULT_METERS_PER_PIXEL);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Line tool precision state
  const [orthoEnabled, setOrthoEnabled] = useState(false);
  const [lineMode, setLineMode] = useState<'click-click' | 'click-drag'>('click-click');
  const [lineChainActive, setLineChainActive] = useState(false);
  const [liveMeasurement, setLiveMeasurement] = useState<{
    distance: number; bearing: number; position: { x: number; y: number };
  } | null>(null);

  const canvasRef = useRef<View>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Refs for PanResponder stale closure fix (C1)
  const activeToolRef = useRef(activeTool);
  const isDrawingRef = useRef(isDrawing);
  const currentPathRef = useRef(currentPath);
  const entitiesRef = useRef(entities);
  const zoomRef = useRef(zoom);
  const panOffsetRef = useRef(panOffset);
  const metersPerPixelRef = useRef(metersPerPixel);
  const selectedEntityIdRef = useRef(selectedEntityId);

  // Line tool refs
  const orthoEnabledRef = useRef(orthoEnabled);
  const lineModeRef = useRef(lineMode);
  const lineChainActiveRef = useRef(lineChainActive);
  const lineAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const lineChainStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastLineTapTimeRef = useRef<number>(0);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);
  useEffect(() => { currentPathRef.current = currentPath; }, [currentPath]);
  useEffect(() => { entitiesRef.current = entities; }, [entities]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);
  useEffect(() => { metersPerPixelRef.current = metersPerPixel; }, [metersPerPixel]);
  useEffect(() => { selectedEntityIdRef.current = selectedEntityId; }, [selectedEntityId]);
  useEffect(() => { orthoEnabledRef.current = orthoEnabled; }, [orthoEnabled]);
  useEffect(() => { lineModeRef.current = lineMode; }, [lineMode]);
  useEffect(() => { lineChainActiveRef.current = lineChainActive; }, [lineChainActive]);

  // SolidWorks-style toolbar tools (C2: removed fillet/champer from type)
  const cadTools = [
    { name: 'select' as CADTool, icon: 'cursor-default', title: 'Select', group: 'basic' },
    { name: 'line' as CADTool, icon: 'vector-line', title: 'Line', group: 'sketch' },
    { name: 'rectangle' as CADTool, icon: 'rectangle-outline', title: 'Rectangle', group: 'sketch' },
    { name: 'circle' as CADTool, icon: 'circle-outline', title: 'Circle', group: 'sketch' },
    { name: 'arc' as CADTool, icon: 'vector-curve', title: 'Arc', group: 'sketch' },
    { name: 'spline' as CADTool, icon: 'draw-pen', title: 'Spline', group: 'sketch' },
    { name: 'point' as CADTool, icon: 'circle-small', title: 'Point', group: 'sketch' },
    { name: 'text' as CADTool, icon: 'text-box-outline', title: 'Text', group: 'annotation' },
    { name: 'polygon' as CADTool, icon: 'hexagon-outline', title: 'Polygon', group: 'sketch' },
    { name: 'ellipse' as CADTool, icon: 'ellipse-outline', title: 'Ellipse', group: 'sketch' },
    { name: 'dimension' as CADTool, icon: 'ruler', title: 'Dimension', group: 'annotation' },
  ];

  // C1: PanResponder in useMemo with [] deps, using refs for mutable values
  // N10: Updated to handle select mode for panning + coordinate conversion for zoom/pan
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    onPanResponderGrant: (evt) => {
      const tool = activeToolRef.current;
      if (tool === 'select') {
        // Start panning — use pageX/pageY for relative movement tracking
        // Also record the start position to detect taps vs drags
        lastPointRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
        return;
      }

      // N7: Text tool shows input dialog on tap, not drawing
      if (tool === 'text') {
        const { locationX, locationY } = evt.nativeEvent;
        const canvasX = (locationX - panOffsetRef.current.x) / zoomRef.current;
        const canvasY = (locationY - panOffsetRef.current.y) / zoomRef.current;
        setTextInputPosition({ x: canvasX, y: canvasY });
        setShowTextInput(true);
        setTextInputValue('');
        return;
      }

      const { locationX, locationY } = evt.nativeEvent;
      const z = zoomRef.current;
      const pX = panOffsetRef.current.x;
      const pY = panOffsetRef.current.y;
      let cx = (locationX - pX) / z;
      let cy = (locationY - pY) / z;

      // ── Line tool: Click-Click (AutoCAD chain) & Click-Drag (SolidWorks) ──
      if (tool === 'line') {
        const snapped = findNearestEntityPoint(cx, cy, entitiesRef.current);
        if (snapped) { cx = snapped.x; cy = snapped.y; }
        const mode = lineModeRef.current;
        if (mode === 'click-click') {
          lastPointRef.current = { x: cx, y: cy };
          if (!lineChainActiveRef.current) {
            lineAnchorRef.current = { x: cx, y: cy };
            lineChainStartRef.current = { x: cx, y: cy };
            setLineChainActive(true);
            setIsDrawing(true);
            setCurrentPath([{ x: cx, y: cy }]);
          }
          return;
        }
        // Mode B: click-drag
        lineAnchorRef.current = { x: cx, y: cy };
        setIsDrawing(true);
        setCurrentPath([{ x: cx, y: cy }]);
        lastPointRef.current = { x: cx, y: cy };
        return;
      }

      // Other tools (dimension, rectangle, circle, arc, spline, etc.)
      setIsDrawing(true);
      setCurrentPath([{ x: cx, y: cy }]);
      lastPointRef.current = { x: cx, y: cy };
    },

    onPanResponderMove: (evt) => {
      const tool = activeToolRef.current;
      if (tool === 'select') {
        // Pan the canvas using relative movement (pageX/pageY)
        const lastPoint = lastPointRef.current;
        if (lastPoint) {
          const dx = evt.nativeEvent.pageX - lastPoint.x;
          const dy = evt.nativeEvent.pageY - lastPoint.y;
          setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
          lastPointRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
        }
        return;
      }

      const drawing = isDrawingRef.current;
      if (!drawing) return;

      const { locationX, locationY } = evt.nativeEvent;
      const zoom = zoomRef.current;
      const panX = panOffsetRef.current.x;
      const panY = panOffsetRef.current.y;
      let canvasX = (locationX - panX) / zoom;
      let canvasY = (locationY - panY) / zoom;
      const currentPoint = { x: canvasX, y: canvasY };

      if (tool === 'line') {
        const anchor = lineAnchorRef.current;
        if (!anchor) return;
        // Apply entity-endpoint snap for cursor position
        const snapped = findNearestEntityPoint(canvasX, canvasY, entitiesRef.current);
        if (snapped) { canvasX = snapped.x; canvasY = snapped.y; }
        // Apply ortho snap if enabled
        if (orthoEnabledRef.current) {
          const result = snapToOrtho(canvasX - anchor.x, canvasY - anchor.y);
          canvasX = anchor.x + result.x;
          canvasY = anchor.y + result.y;
        }
        setCurrentPath([{ x: anchor.x, y: anchor.y }, { x: canvasX, y: canvasY }]);
        const meas = computeLiveMeasurement(anchor, { x: canvasX, y: canvasY }, metersPerPixelRef.current);
        setLiveMeasurement(meas);
        return;
      }

      if (tool === 'spline' || tool === 'dimension') {
        const lastPoint = lastPointRef.current;
        if (lastPoint) {
          const distance = Math.hypot(
            currentPoint.x - lastPoint.x,
            currentPoint.y - lastPoint.y,
          );
          if (distance > 5) {
            setCurrentPath(prev => [...prev, currentPoint]);
            lastPointRef.current = currentPoint;
          }
        }
      } else if (tool === 'rectangle' || tool === 'circle' || tool === 'ellipse') {
        setCurrentPath(prev => [prev[0], currentPoint]);
      } else if (tool === 'arc') {
        setCurrentPath(prev => [...prev, currentPoint]);
      }
    },

    onPanResponderRelease: (evt) => {
      // ── Line tool release: handle click-click and click-drag modes ──
      if (activeToolRef.current === 'line') {
        const mode = lineModeRef.current;
        const anchor = lineAnchorRef.current;
        const path = currentPathRef.current;

        if (mode === 'click-click') {
          const lastPressPoint = lastPointRef.current;
          const { locationX, locationY } = evt.nativeEvent;
          const z = zoomRef.current;
          const pX = panOffsetRef.current.x;
          const pY = panOffsetRef.current.y;
          let cx = (locationX - pX) / z;
          let cy = (locationY - pY) / z;
          const isTap = lastPressPoint && Math.hypot(cx - lastPressPoint.x, cy - lastPressPoint.y) < TAP_THRESHOLD_PX;

          if (isTap) {
            const snapped = findNearestEntityPoint(cx, cy, entitiesRef.current);
            if (snapped) { cx = snapped.x; cy = snapped.y; }
            const endPt = { x: cx, y: cy };

            if (lineChainActiveRef.current && anchor && Math.hypot(endPt.x - anchor.x, endPt.y - anchor.y) > MIN_SEGMENT_PX) {
              const currentEntities = entitiesRef.current;
              const newEntity: CADEntity = {
                id: Date.now().toString(), type: 'line',
                points: [{ x: anchor.x, y: anchor.y }, { x: endPt.x, y: endPt.y }],
              };
              setUndoStack(prev => [...prev, currentEntities]);
              setRedoStack([]);
              setEntities(prev => [...prev, newEntity]);
            }

            // Double-tap detection for chain termination
            const now = Date.now();
            if (now - lastLineTapTimeRef.current < DOUBLE_TAP_MS && lineChainActiveRef.current) {
              lastLineTapTimeRef.current = 0;
              setCurrentPath([]); setIsDrawing(false); setLineChainActive(false);
              setLiveMeasurement(null);
              lineAnchorRef.current = null; lineChainStartRef.current = null;
              lastPointRef.current = null;
              return;
            }
            lastLineTapTimeRef.current = now;

            // Continue chain: this tap becomes new anchor
            lineAnchorRef.current = { x: cx, y: cy };
            setCurrentPath([{ x: cx, y: cy }]);
            setLiveMeasurement(null);
            setIsDrawing(true);
            lastPointRef.current = null;
            return;
          }

          // Dragged in click-click mode: finalize segment, end chain
          if (anchor && path.length >= 2) {
            const endPtDrag = path[1];
            if (Math.hypot(endPtDrag.x - anchor.x, endPtDrag.y - anchor.y) > MIN_SEGMENT_PX) {
              const currentEntities = entitiesRef.current;
              const newEntity: CADEntity = {
                id: Date.now().toString(), type: 'line',
                points: [{ x: anchor.x, y: anchor.y }, { x: endPtDrag.x, y: endPtDrag.y }],
              };
              setUndoStack(prev => [...prev, currentEntities]);
              setRedoStack([]);
              setEntities(prev => [...prev, newEntity]);
            }
          }
          setCurrentPath([]); setIsDrawing(false); setLineChainActive(false);
          setLiveMeasurement(null);
          lineAnchorRef.current = null; lineChainStartRef.current = null;
          lastPointRef.current = null;
          return;
        }

        // Mode B: click-drag — single segment, tool stops
        if (path.length >= 2 && anchor) {
          const endPt = path[1];
          if (Math.hypot(endPt.x - anchor.x, endPt.y - anchor.y) > MIN_SEGMENT_PX) {
            const currentEntities = entitiesRef.current;
            const newEntity: CADEntity = {
              id: Date.now().toString(), type: 'line',
              points: [{ x: anchor.x, y: anchor.y }, { x: endPt.x, y: endPt.y }],
            };
            setUndoStack(prev => [...prev, currentEntities]);
            setRedoStack([]);
            setEntities(prev => [...prev, newEntity]);
          }
        }
        setCurrentPath([]); setIsDrawing(false); setLineChainActive(false);
        setLiveMeasurement(null);
        lineAnchorRef.current = null;
        lastPointRef.current = null;
        return;
      }

      // ── Non-line tools: existing release logic ──
      const tool = activeToolRef.current;
      if (tool === 'select') {
        // N3: Detect tap vs drag — if barely moved, it's a tap for entity selection
        const lastPoint = lastPointRef.current;
        if (lastPoint) {
          const dx = Math.abs(evt.nativeEvent.pageX - lastPoint.x);
          const dy = Math.abs(evt.nativeEvent.pageY - lastPoint.y);
          if (dx < 5 && dy < 5) {
            // Tap — hit test for entity selection
            const { locationX, locationY } = evt.nativeEvent;
            const canvasX = (locationX - panOffsetRef.current.x) / zoomRef.current;
            const canvasY = (locationY - panOffsetRef.current.y) / zoomRef.current;
            const hitId = findEntityAtPoint(canvasX, canvasY);
            setSelectedEntityId(hitId);
          }
        }
        lastPointRef.current = null;
        return;
      }

      const path = currentPathRef.current;
      const drawing = isDrawingRef.current;

      if (!drawing || path.length === 0) {
        setIsDrawing(false);
        setCurrentPath([]);
        lastPointRef.current = null;
        return;
      }

      // M4: Push current entities to undo stack before adding new entity
      const currentEntities = entitiesRef.current;

      // M7: For rectangle, compute 4 corners from 2 diagonal points
      if (tool === 'rectangle' && path.length >= 2) {
        const start = path[0];
        const end = path[1];
        const rectPoints = [
          { x: start.x, y: start.y },
          { x: end.x, y: start.y },
          { x: end.x, y: end.y },
          { x: start.x, y: end.y },
        ];
        const newEntity: CADEntity = {
          id: Date.now().toString(),
          type: 'rectangle',
          points: rectPoints,
        };
        setUndoStack(prev => [...prev, currentEntities]);
        setRedoStack([]);
        setEntities(prev => [...prev, newEntity]);
      } else if (tool === 'ellipse' && path.length >= 2) {
        // Store center + edge point for ellipse
        const newEntity: CADEntity = {
          id: Date.now().toString(),
          type: 'ellipse',
          points: [...path],
        };
        setUndoStack(prev => [...prev, currentEntities]);
        setRedoStack([]);
        setEntities(prev => [...prev, newEntity]);
      } else if (tool === 'dimension' && path.length >= 2) {
        // N6: Dimension entity with computed pixel distance + real-world distance
        const p1 = path[0];
        const p2 = path[path.length - 1];
        const pixelDist = Math.max(0.5, Math.hypot(p2.x - p1.x, p2.y - p1.y));
        const realDist = pixelDist * metersPerPixelRef.current;
        const newEntity: CADEntity = {
          id: Date.now().toString(),
          type: 'dimension',
          points: [p1, p2],
          properties: {
            distance: realDist,
            pixelDistance: pixelDist,
          },
        };
        setUndoStack(prev => [...prev, currentEntities]);
        setRedoStack([]);
        setEntities(prev => [...prev, newEntity]);
      } else {
        const newEntity: CADEntity = {
          id: Date.now().toString(),
          type: tool,
          points: [...path],
        };
        setUndoStack(prev => [...prev, currentEntities]);
        setRedoStack([]);
        setEntities(prev => [...prev, newEntity]);
      }

      setCurrentPath([]);
      setIsDrawing(false);
      lastPointRef.current = null;
    },
  }), []);

  const handleToolSelect = useCallback((tool: CADTool) => {
    if (activeTool === 'line' && lineChainActive) {
      setCurrentPath([]);
      setIsDrawing(false);
      setLineChainActive(false);
      setLiveMeasurement(null);
      lineAnchorRef.current = null;
      lineChainStartRef.current = null;
      lastPointRef.current = null;
    }
    setActiveTool(tool);
    setIsDrawing(false);
    setCurrentPath([]);
    setSelectedEntityId(null);
  }, [activeTool, lineChainActive]);

  // Line tool: finish chain (via double-tap or Finish button)
  const finishLineChain = useCallback(() => {
    setCurrentPath([]);
    setIsDrawing(false);
    setLineChainActive(false);
    setLiveMeasurement(null);
    lineAnchorRef.current = null;
    lineChainStartRef.current = null;
    lastPointRef.current = null;
  }, []);

  // Line tool: close chain back to first point
  const handleCloseLineChain = useCallback(() => {
    const anchor = lineAnchorRef.current;
    const startPt = lineChainStartRef.current;
    if (!anchor || !startPt || !lineChainActiveRef.current) return;
    if (Math.hypot(anchor.x - startPt.x, anchor.y - startPt.y) > MIN_SEGMENT_PX) {
      const currentEntities = entitiesRef.current;
      const newEntity: CADEntity = {
        id: Date.now().toString(),
        type: 'line',
        points: [{ x: anchor.x, y: anchor.y }, { x: startPt.x, y: startPt.y }],
      };
      setUndoStack(prev => [...prev, currentEntities]);
      setRedoStack([]);
      setEntities(prev => [...prev, newEntity]);
    }
    finishLineChain();
  }, [finishLineChain]);

  // N3: Hit-test — find entity closest to a canvas point
  const findEntityAtPoint = useCallback((x: number, y: number, threshold = 15) => {
    const ents = entitiesRef.current;
    let closestId: string | null = null;
    let closestDist = threshold;

    for (const entity of ents) {
      for (const pt of entity.points) {
        const dist = Math.hypot(pt.x - x, pt.y - y);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = entity.id;
        }
      }
    }
    return closestId;
  }, []);

  // N3: Delete selected entity
  const handleDeleteSelected = useCallback(() => {
    const id = selectedEntityIdRef.current;
    if (!id) return;
    setUndoStack(prev => [...prev, entitiesRef.current]);
    setRedoStack([]);
    setEntities(prev => prev.filter(e => e.id !== id));
    setSelectedEntityId(null);
  }, []);

  // N7: Create text entity from input
  const handleTextSubmit = useCallback(() => {
    if (!textInputValue.trim()) {
      setShowTextInput(false);
      return;
    }
    const pos = textInputPosition;
    const currentEntities = entitiesRef.current;
    setUndoStack(prev => [...prev, currentEntities]);
    setRedoStack([]);
    setEntities(prev => [...prev, {
      id: Date.now().toString(),
      type: 'text' as CADEntityType,
      points: [pos],
      properties: { text: textInputValue.trim() },
    }]);
    setShowTextInput(false);
    setTextInputValue('');
  }, [textInputValue, textInputPosition]);

  // M4: Undo/redo for drawn entities
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prevState = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, entities[entities.length - 1]]);
    setUndoStack(prev => prev.slice(0, -1));
    setEntities(prevState);
  }, [undoStack, entities]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const lastEntity = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, entities]);
    setRedoStack(prev => prev.slice(0, -1));
    setEntities(prev => [...prev, lastEntity]);
  }, [redoStack, entities]);

  // ── Import DXF file ──
  const handleImportDXF = useCallback(async () => {
    setShowImportMenu(false);
    setIsImporting(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled) {
        Alert.alert('Import Cancelled', 'No file was selected.');
        return;
      }

      const uri = (res as any).assets?.[0]?.uri ?? (res as any).uri;
      const name = (res as any).assets?.[0]?.name ?? (res as any).name ?? '';

      if (!uri) {
        Alert.alert('Import Error', 'Could not read file path.');
        return;
      }

      const ext = name.toLowerCase().split('.').pop();
      if (ext === 'dwg') {
        Alert.alert(
          'DWG Not Supported',
          'DWG is a proprietary binary format. Please export your drawing as DXF from AutoCAD first:\n\nFile → Save As → AutoCAD DXF (*.dxf)',
        );
        return;
      }

      if (ext !== 'dxf') {
        Alert.alert('Unsupported Format', 'Please select a .dxf file. Other formats are not supported in CAD mode.');
        return;
      }

      const content = await FileSystem.readAsStringAsync(uri);
      const cadModel = parseDXF(content);

      const importedEntities: CADEntity[] = [];
      let nextId = 0;
      let skippedCount = 0;
      const makeId = () => `imp-${Date.now()}-${nextId++}`;

      for (const entity of cadModel.entities) {
        switch (entity.type) {
          case 'Line':
            importedEntities.push({
              id: makeId(),
              type: 'line',
              points: [
                { x: entity.start.x, y: entity.start.y },
                { x: entity.end.x, y: entity.end.y },
              ],
            });
            break;
          case 'Point':
            importedEntities.push({
              id: makeId(),
              type: 'point',
              points: [{ x: entity.position.x, y: entity.position.y }],
            });
            break;
          case 'Arc': {
            // Parser now guarantees endAngle - startAngle is the correct CCW sweep.
            let sweep = entity.endAngle - entity.startAngle;
            if (Math.abs(sweep) < 1e-10) sweep = 2 * Math.PI; // full circle

            const numPoints = Math.max(24, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
            const points: Array<{ x: number; y: number }> = [];
            for (let i = 0; i <= numPoints; i++) {
              const angle = entity.startAngle + sweep * (i / numPoints);
              points.push({
                x: entity.center.x + entity.radius * Math.cos(angle),
                y: entity.center.y + entity.radius * Math.sin(angle),
              });
            }

            // Full circles (CIRCLE entity or 2π arc) render as 'circle' for proper borderRadius
            const isFullCircle = Math.abs(sweep) > 2 * Math.PI - 0.01;
            if (isFullCircle) {
              importedEntities.push({
                id: makeId(),
                type: 'circle',
                points: [
                  { x: entity.center.x, y: entity.center.y },
                  { x: entity.center.x + entity.radius, y: entity.center.y },
                ],
              });
            } else {
              importedEntities.push({ id: makeId(), type: 'arc', points });
            }
            break;
          }
          case 'Polyline': {
            const pts: Array<{ x: number; y: number }> = [{ x: entity.startPoint.x, y: entity.startPoint.y }];
            for (const seg of entity.segments) {
              if (seg.segmentType === 'Arc') {
                // Parser now guarantees endAngle - startAngle is the correct signed sweep.
                const sweep = Math.abs(seg.endAngle - seg.startAngle) < 1e-10
                  ? 2 * Math.PI
                  : seg.endAngle - seg.startAngle;
                const arcPts = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
                // Skip first point — it's the same as the previous segment's endpoint
                for (let j = 1; j <= arcPts; j++) {
                  const angle = seg.startAngle + sweep * (j / arcPts);
                  pts.push({
                    x: seg.center.x + seg.radius * Math.cos(angle),
                    y: seg.center.y + seg.radius * Math.sin(angle),
                  });
                }
              } else {
                pts.push({ x: seg.to.x, y: seg.to.y });
              }
            }
            importedEntities.push({
              id: makeId(),
              type: entity.closed ? 'polygon' : 'spline',
              points: pts,
            });
            break;
          }
          case 'Text': {
            importedEntities.push({
              id: makeId(),
              type: 'text',
              points: [{ x: entity.position.x, y: entity.position.y }],
              properties: { text: entity.text, height: entity.height, rotation: entity.rotation },
            });
            break;
          }
          default:
            skippedCount++;
            break;
        }
      }

      if (skippedCount > 0) {
        Alert.alert(
          'DXF Import Notice',
          `${importedEntities.length} entities imported. ${skippedCount} unsupported entities were skipped.`
        );
      }

      if (importedEntities.length === 0) {
        Alert.alert('Empty DXF', 'No drawable entities found in the DXF file.');
        return;
      }

      // N4: Y-axis flip — DXF/CAD Y increases upward, canvas Y increases downward.
      // Compute pre-flip bounding box for the flip reference, then flip Y around center.
      const preFlipBbox = computeBoundingBox(importedEntities.flatMap(e => e.points));
      for (const ent of importedEntities) {
        for (const pt of ent.points) {
          pt.y = preFlipBbox.maxY + preFlipBbox.minY - pt.y;
        }
      }

      // C3: Scale DXF coordinates to fit the canvas viewport (using already-flipped coordinates)
      const allPoints = importedEntities.flatMap(e => e.points);
      const bbox = computeBoundingBox(allPoints);
      const transform = scaleToViewport(bbox, screenWidth, screenHeight, 40);

      // N2: Update metersPerPixel based on the imported drawing's real-world scale
      if (cadModel.unitScale > 0) {
        const mpp = estimateMetersPerPixel(bbox, screenWidth, screenHeight, 40);
        setMetersPerPixel(mpp);
      }

      const scaledEntities = importedEntities.map(ent => ({
        ...ent,
        points: ent.points.map(p => ({
          x: (p.x - bbox.minX) * transform.scale + transform.offsetX,
          y: (p.y - bbox.minY) * transform.scale + transform.offsetY,
        })),
      }));

      // M4: Push current entities to undo stack before DXF import
      setUndoStack(prev => [...prev, entitiesRef.current]);
      setRedoStack([]);
      setEntities(prev => [...prev, ...scaledEntities]);
      if (onImportDXF) onImportDXF(scaledEntities);
      Alert.alert(
        'DXF Imported',
        `${importedEntities.length} entities imported in local design coordinates.`,
        [{ text: 'Got it' }]
      );
    } catch (err: any) {
      Alert.alert('Import Failed', err.message ?? String(err));
    } finally {
      setIsImporting(false);
    }
  }, [onImportDXF]);

  // Convert canvas pixel points to local design-frame metres.
  // Canvas center = (0,0), right = +x, up = +y (canvas Y is flipped).
  const pointsToDesignPoints = useCallback((points: Array<{ x: number; y: number }>): DesignPoint[] => {
    const mpp = metersPerPixelRef.current;
    const cx = screenWidth / 2;
    const cy = screenHeight / 2;
    return points.map(p => ({
      x: (p.x - cx) * mpp,
      y: (cy - p.y) * mpp,
    }));
  }, []);

  // ── Export current drawing (m4: real file export, N9: use refs for stable callback) ──
  const handleExport = useCallback(async () => {
    const ents = entitiesRef.current;
    if (ents.length === 0) {
      Alert.alert('Nothing to Export', 'Draw something first before exporting.');
      return;
    }
    try {
      const lines = ents.map((e, i) => {
        const pts = e.points.map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ');
        return `ENTITY ${i + 1} TYPE=${e.type} POINTS=[${pts}]`;
      });
      const content = `# CAD Drawing Export\n# Entities: ${ents.length}\n# Frame: local design (metres)\n\n${lines.join('\n')}\n`;

      const fileUri = `${FileSystem.documentDirectory}cad-export-${Date.now()}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, content);
      await Sharing.shareAsync(fileUri, { mimeType: 'text/plain', dialogTitle: 'Export CAD Drawing' });
    } catch (err: any) {
      Alert.alert('Export Failed', err.message ?? String(err));
    }
  }, []);

  const handleSave = useCallback(() => {
    if (entities.length === 0) {
      Alert.alert('No Drawing', 'Please draw something before saving.');
      return;
    }

    const designPoints: DesignPoint[] = [];

    for (const entity of entities) {
      if (entity.type === 'circle' && entity.points.length >= 2) {
        const center = entity.points[0];
        const edge = entity.points[1];
        const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
        const circlePoints: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < 24; i++) {
          const angle = (i * Math.PI * 2) / 24;
          circlePoints.push({
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle),
          });
        }
        circlePoints.push(circlePoints[0]); // close the circle
        designPoints.push(...pointsToDesignPoints(circlePoints));
      } else if (entity.type === 'ellipse' && entity.points.length >= 2) {
        const center = entity.points[0];
        const edge = entity.points[1];
        const rx = Math.abs(edge.x - center.x);
        const ry = Math.abs(edge.y - center.y);
        const ellipsePoints: Array<{ x: number; y: number }> = [];
        for (let i = 0; i <= 32; i++) {
          const angle = (i * Math.PI * 2) / 32;
          ellipsePoints.push({
            x: center.x + rx * Math.cos(angle),
            y: center.y + ry * Math.sin(angle),
          });
        }
        designPoints.push(...pointsToDesignPoints(ellipsePoints));
      } else {
        designPoints.push(...pointsToDesignPoints(entity.points));
      }
    }

    if (designPoints.length === 0) {
      Alert.alert('No Drawing', 'Please draw something before saving.');
      return;
    }

    onSaveDesignPoints(designPoints);
    onClose();
  }, [onSaveDesignPoints, onClose, entities, pointsToDesignPoints]);

  // ── Render entities ──
  // N3: Selection highlight wraps selected entity
  const renderEntity = useCallback((entity: CADEntity) => {
    if (entity.points.length === 0) return null;

    // Guard: skip entities with NaN/Infinity coordinates (crashes React Native native renderer)
    const hasInvalidCoords = entity.points.some(p =>
      !isFinite(p.x) || !isFinite(p.y)
    );
    if (hasInvalidCoords) return null;

    const isSelected = entity.id === selectedEntityId;

    // Line rendering — position at midpoint, rotate around center (default transformOrigin)
    if (entity.type === 'line') {
      return (
        <View key={entity.id} style={styles.entityContainer}>
          {entity.points.map((point, idx) => {
            if (idx === 0) return null;
            const prevPoint = entity.points[idx - 1];
            const dx = point.x - prevPoint.x;
            const dy = point.y - prevPoint.y;
            const distance = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            return (
              <View
                key={`line-${entity.id}-${idx}`}
                style={[
                  styles.lineSegment,
                  isSelected && styles.lineSegmentSelected,
                  {
                    left: (prevPoint.x + point.x) / 2 - distance / 2,
                    top: (prevPoint.y + point.y) / 2 - 1,
                    width: distance,
                    transform: [{ rotate: `${angle}deg` }],
                                      },
                ]}
              />
            );
          })}
          {entity.points.map((point, idx) => (
            <View
              key={`point-${entity.id}-${idx}`}
              style={[
                styles.linePoint,
                isSelected && styles.linePointSelected,
                {
                  left: point.x - 4,
                  top: point.y - 4,
                },
              ]}
            />
          ))}
        </View>
      );
    }

    // Circle rendering (C6: proper borderRadius = width/2 = height/2)
    if (entity.type === 'circle' && entity.points.length >= 2) {
      const center = entity.points[0];
      const edge = entity.points[1];
      const radius = Math.max(1, Math.hypot(edge.x - center.x, edge.y - center.y));

      return (
        <View key={entity.id} style={styles.entityContainer}>
          <View
            style={[
              styles.circle,
              isSelected && styles.circleSelected,
              {
                left: center.x - radius,
                top: center.y - radius,
                width: radius * 2,
                height: radius * 2,
                borderRadius: radius,
              },
            ]}
          />
          <View
            style={[
              styles.circleCenter,
              {
                left: center.x - 3,
                top: center.y - 3,
              },
            ]}
          />
          <View
            style={[
              styles.circleEdge,
              {
                left: edge.x - 2,
                top: edge.y - 2,
              },
            ]}
          />
        </View>
      );
    }

    // C5: Rectangle rendering - 4 line segments from 4 corners
    if (entity.type === 'rectangle' && entity.points.length >= 4) {
      const corners = entity.points;
      return (
        <View key={entity.id} style={styles.entityContainer}>
          {corners.map((point, idx) => {
            const nextPoint = corners[(idx + 1) % corners.length];
            const dx = nextPoint.x - point.x;
            const dy = nextPoint.y - point.y;
            const distance = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View
                key={`rect-${entity.id}-${idx}`}
                style={[
                  styles.lineSegment,
                  isSelected && styles.lineSegmentSelected,
                  {
                    left: (point.x + nextPoint.x) / 2 - distance / 2,
                    top: (point.y + nextPoint.y) / 2 - 1,
                    width: distance,
                    transform: [{ rotate: `${angle}deg` }],
                                      },
                ]}
              />
            );
          })}
          {corners.map((point, idx) => (
            <View
              key={`rect-pt-${entity.id}-${idx}`}
              style={[
                styles.linePoint,
                isSelected && styles.linePointSelected,
                { left: point.x - 4, top: point.y - 4 },
              ]}
            />
          ))}
        </View>
      );
    }

    // C5: Arc rendering - polyline through generated points
    if (entity.type === 'arc' && entity.points.length >= 2) {
      return (
        <View key={entity.id} style={styles.entityContainer}>
          {entity.points.map((point, idx) => {
            if (idx === 0) return null;
            const prevPoint = entity.points[idx - 1];
            const dx = point.x - prevPoint.x;
            const dy = point.y - prevPoint.y;
            const distance = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View
                key={`arc-${entity.id}-${idx}`}
                style={[
                  styles.lineSegment,
                  isSelected && styles.lineSegmentSelected,
                  {
                    left: (prevPoint.x + point.x) / 2 - distance / 2,
                    top: (prevPoint.y + point.y) / 2 - 1,
                    width: distance,
                    transform: [{ rotate: `${angle}deg` }],
                                      },
                ]}
              />
            );
          })}
        </View>
      );
    }

    // C5: Spline/polygon rendering - polyline through points
    if ((entity.type === 'spline' || entity.type === 'polygon') && entity.points.length >= 2) {
      const isClosed = entity.type === 'polygon';
      const allPoints = isClosed ? [...entity.points, entity.points[0]] : entity.points;
      return (
        <View key={entity.id} style={styles.entityContainer}>
          {allPoints.map((point, idx) => {
            if (idx === 0) return null;
            const prevPoint = allPoints[idx - 1];
            const dx = point.x - prevPoint.x;
            const dy = point.y - prevPoint.y;
            const distance = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View
                key={`spline-${entity.id}-${idx}`}
                style={[
                  styles.lineSegment,
                  isSelected && styles.lineSegmentSelected,
                  {
                    left: (prevPoint.x + point.x) / 2 - distance / 2,
                    top: (prevPoint.y + point.y) / 2 - 1,
                    width: distance,
                    transform: [{ rotate: `${angle}deg` }],
                                      },
                ]}
              />
            );
          })}
          {entity.points.map((point, idx) => (
            <View
              key={`spline-pt-${entity.id}-${idx}`}
              style={[
                styles.linePoint,
                isSelected && styles.linePointSelected,
                { left: point.x - 4, top: point.y - 4 },
              ]}
            />
          ))}
        </View>
      );
    }

    // C5: Ellipse rendering - approximate with polyline segments
    if (entity.type === 'ellipse' && entity.points.length >= 2) {
      const center = entity.points[0];
      const edge = entity.points[1];
      const rx = Math.abs(edge.x - center.x);
      const ry = Math.abs(edge.y - center.y);
      const numSegments = 32;
      const ellipsePoints: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= numSegments; i++) {
        const angle = (i * Math.PI * 2) / numSegments;
        ellipsePoints.push({
          x: center.x + rx * Math.cos(angle),
          y: center.y + ry * Math.sin(angle),
        });
      }
      return (
        <View key={entity.id} style={styles.entityContainer}>
          {ellipsePoints.map((point, idx) => {
            if (idx === 0) return null;
            const prevPoint = ellipsePoints[idx - 1];
            const dx = point.x - prevPoint.x;
            const dy = point.y - prevPoint.y;
            const distance = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View
                key={`ellipse-${entity.id}-${idx}`}
                style={[
                  styles.lineSegment,
                  isSelected && styles.lineSegmentSelected,
                  {
                    left: (prevPoint.x + point.x) / 2 - distance / 2,
                    top: (prevPoint.y + point.y) / 2 - 1,
                    width: distance,
                    transform: [{ rotate: `${angle}deg` }],
                                      },
                ]}
              />
            );
          })}
          <View
            style={[
              styles.circleCenter,
              { left: center.x - 3, top: center.y - 3 },
            ]}
          />
        </View>
      );
    }

    // C5: Point rendering - small circle at coordinates
    if (entity.type === 'point') {
      const point = entity.points[0];
      return (
        <View key={entity.id} style={styles.entityContainer}>
          <View
            style={[
              styles.pointMarker,
              isSelected && styles.pointMarkerSelected,
              { left: point.x - 4, top: point.y - 4 },
            ]}
          />
        </View>
      );
    }

    // C5: Text rendering
    if (entity.type === 'text') {
      const point = entity.points[0];
      const textContent = (entity.properties?.text as string) ?? 'Text';
      return (
        <View key={entity.id} style={styles.entityContainer}>
          <Text
            style={[
              styles.entityText,
              isSelected && styles.entityTextSelected,
              { left: point.x, top: point.y },
            ]}
          >
            {textContent}
          </Text>
        </View>
      );
    }

    // C5: Dimension rendering — uses real-world distance from properties if available
    if (entity.type === 'dimension') {
      if (entity.points.length >= 2) {
        const p1 = entity.points[0];
        const p2 = entity.points[entity.points.length - 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const pixelDist = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        // Prefer real-world distance from properties (N6), fall back to pixel distance
        const displayDist = (entity.properties?.distance as number) ?? pixelDist;
        const unitLabel = entity.properties?.distance ? 'm' : 'px';
        return (
          <View key={entity.id} style={styles.entityContainer}>
            <View
              style={[
                styles.dimensionLine,
                isSelected && styles.dimensionLineSelected,
                {
                  left: (p1.x + p2.x) / 2 - pixelDist / 2,
                  top: (p1.y + p2.y) / 2 - 0.5,
                  width: pixelDist,
                  transform: [{ rotate: `${angle}deg` }],
                                  },
              ]}
            />
            <View
              style={[
                styles.linePoint,
                isSelected && styles.linePointSelected,
                { left: p1.x - 4, top: p1.y - 4 },
              ]}
            />
            <View
              style={[
                styles.linePoint,
                isSelected && styles.linePointSelected,
                { left: p2.x - 4, top: p2.y - 4 },
              ]}
            />
            <View
              style={[
                styles.dimensionLabel,
                isSelected && styles.dimensionLabelSelected,
                { left: midX - 20, top: midY - 10 },
              ]}
            >
              <Text style={styles.dimensionText}>{displayDist.toFixed(1)}{unitLabel}</Text>
            </View>
          </View>
        );
      }
      const point = entity.points[0];
      return (
        <View key={entity.id} style={styles.entityContainer}>
          <Text style={[styles.entityText, { left: point.x, top: point.y }]}>
            Dim
          </Text>
        </View>
      );
    }

    // Fallback for unknown types
    return null;
  }, [selectedEntityId]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* SolidWorks-style Top Toolbar */}
        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
            <Text style={styles.toolbarTitle}>CAD Drawing</Text>
            <View style={styles.toolbarLeftActions}>
              <TouchableOpacity
                style={[styles.importBtn, showImportMenu && styles.importBtnActive]}
                onPress={() => setShowImportMenu(prev => !prev)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="file-import-outline" size={16} color={showImportMenu ? '#60A5FA' : colors.accent} />
                <Text style={[styles.importBtnText, showImportMenu && styles.importBtnTextActive]}>IMPORT</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exportBtn} onPress={handleExport} activeOpacity={0.7}>
                <MaterialCommunityIcons name="file-export-outline" size={16} color={colors.greenBtn} />
                <Text style={styles.exportBtnText}>EXPORT</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.toolbarCenter}>
            {cadTools.map((tool) => (
              <TouchableOpacity
                key={tool.name}
                style={[
                  styles.toolBtn,
                  activeTool === tool.name && styles.toolBtnActive,
                ]}
                onPress={() => handleToolSelect(tool.name)}
              >
                <MaterialCommunityIcons
                  name={tool.icon as any}
                  size={20}
                  color={activeTool === tool.name ? colors.accent : colors.textSecondary}
                />
                <Text style={[
                  styles.toolBtnText,
                  activeTool === tool.name && styles.toolBtnTextActive,
                ]}>
                  {tool.title}
                </Text>
              </TouchableOpacity>
            ))}
            {onShowSurveyGrid && (
              <>
                <View style={styles.toolbarDivider} />
                <TouchableOpacity
                  style={styles.toolBtn}
                  onPress={onShowSurveyGrid}
                >
                  <Fontisto name="nav-icon-grid-a" size={18} color={colors.greenBtn} />
                  <Text style={styles.toolBtnText}>Survey</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={styles.toolbarRight}>
            {/* N3: Delete selected entity button */}
            {selectedEntityId && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDeleteSelected}
              >
                <MaterialCommunityIcons name="delete-outline" size={20} color="#EF4444" />
                <Text style={styles.deleteBtnText}>Del</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.toolBtn, undoStack.length === 0 && styles.toolBtnDisabled]}
              onPress={handleUndo}
              disabled={undoStack.length === 0}
            >
              <MaterialCommunityIcons name="undo" size={20} color={undoStack.length > 0 ? colors.accent : colors.textMuted} />
              <Text style={styles.toolBtnText}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtn, redoStack.length === 0 && styles.toolBtnDisabled]}
              onPress={handleRedo}
              disabled={redoStack.length === 0}
            >
              <MaterialCommunityIcons name="redo" size={20} color={redoStack.length > 0 ? colors.accent : colors.textMuted} />
              <Text style={styles.toolBtnText}>Redo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <MaterialCommunityIcons name="check" size={20} color={colors.text} />
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Import dropdown menu — rendered outside canvas PanResponder to avoid gesture conflicts */}
        {showImportMenu && (
          <TouchableOpacity
            style={styles.importBackdrop}
            activeOpacity={1}
            onPress={() => setShowImportMenu(false)}
          >
            <View />
          </TouchableOpacity>
        )}
        {showImportMenu && (
          <View style={styles.importMenu}>
            <Text style={styles.importMenuTitle}>IMPORT FORMAT</Text>
            <TouchableOpacity style={styles.importOption} onPress={handleImportDXF} activeOpacity={0.7}>
              <MaterialCommunityIcons name="file-document-outline" size={18} color={colors.accent} />
              <View style={styles.importOptionText}>
                <Text style={styles.importOptionLabel}>DXF File</Text>
                <Text style={styles.importOptionSub}>AutoCAD Drawing Exchange</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.importDivider} />
            <TouchableOpacity
              style={styles.importOption}
              onPress={() => {
                setShowImportMenu(false);
                Alert.alert(
                  'DWG Not Supported',
                  'DWG is a proprietary binary format.\n\nPlease export as DXF from AutoCAD:\nFile → Save As → AutoCAD DXF (*.dxf)',
                );
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="file-document" size={18} color={colors.textMuted} />
              <View style={styles.importOptionText}>
                <Text style={[styles.importOptionLabel, { color: colors.textMuted }]}>DWG File</Text>
                <Text style={styles.importOptionSub}>Export as DXF first</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Line tool precision controls ── */}
        {activeTool === 'line' && (
          <View style={styles.lineToolControls}>
            <TouchableOpacity
              style={[styles.lineControlBtn, orthoEnabled && styles.lineControlBtnActive]}
              onPress={() => setOrthoEnabled(prev => !prev)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="axis-arrow"
                size={16}
                color={orthoEnabled ? colors.greenBtn : colors.textSecondary}
              />
              <Text style={[styles.lineControlText, orthoEnabled && styles.lineControlTextActive]}>
                ORTHO {orthoEnabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.lineControlBtn}
              onPress={() => setLineMode(prev => prev === 'click-click' ? 'click-drag' : 'click-click')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={lineMode === 'click-click' ? 'cursor-default' : 'cursor-default-click'}
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.lineControlText}>
                {lineMode === 'click-click' ? 'Click-Click' : 'Click-Drag'}
              </Text>
            </TouchableOpacity>

            {lineChainActive && (
              <>
                <TouchableOpacity style={styles.lineControlBtn} onPress={finishLineChain} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="check-bold" size={16} color={colors.greenBtn} />
                  <Text style={styles.lineControlText}>Finish</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.lineControlBtn} onPress={handleCloseLineChain} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="vector-polygon" size={16} color={colors.accent} />
                  <Text style={styles.lineControlText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Drawing Canvas */}
        <View
          style={styles.canvas}
          ref={canvasRef}
          {...panResponder.panHandlers}
        >

          {/* N10: Canvas content with zoom/pan transform */}
          <View style={[
            styles.canvasContent,
            {
              transform: [
                { translateX: panOffset.x },
                { translateY: panOffset.y },
                { scale: zoom },
              ],
            },
          ]}>
          {/* M5: Memoized Grid Background */}
          <MemoizedGrid />

          {/* Render existing entities */}
          {entities.map(renderEntity)}

          {/* Line tool: anchor-only dot when chain active but no cursor point yet */}
          {isDrawing && currentPath.length === 1 && activeTool === 'line' && lineChainActive && (
            <View
              style={[styles.currentLinePoint, {
                left: currentPath[0].x - 3,
                top: currentPath[0].y - 3,
              }]}
            />
          )}

          {/* Line tool: single-segment preview + measurement overlay */}
          {isDrawing && currentPath.length >= 2 && activeTool === 'line' && (() => {
            const p1 = currentPath[0];
            const p2 = currentPath[1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const pixelDist = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View key="current-line">
                <View
                  style={[styles.currentLineSegment, {
                    left: (p1.x + p2.x) / 2 - pixelDist / 2,
                    top: (p1.y + p2.y) / 2 - 1,
                    width: pixelDist,
                    transform: [{ rotate: `${angle}deg` }],
                  }]}
                />
                <View style={[styles.currentLinePoint, { left: p1.x - 3, top: p1.y - 3 }]} />
                <View style={[styles.currentLinePoint, { left: p2.x - 3, top: p2.y - 3 }]} />
                {liveMeasurement && (
                  <View style={[styles.liveMeasurementLabel, {
                    left: liveMeasurement.position.x - 40,
                    top: liveMeasurement.position.y - 12,
                  }]}>
                    <Text style={styles.liveMeasurementText}>
                      {liveMeasurement.distance.toFixed(1)}m | {liveMeasurement.bearing.toFixed(0)}°
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Current drawing path - circle preview (C6) */}
          {isDrawing && currentPath.length >= 2 && activeTool === 'circle' && (
            <View
              style={[
                styles.circle,
                {
                  left: currentPath[0].x - Math.hypot(currentPath[1].x - currentPath[0].x, currentPath[1].y - currentPath[0].y),
                  top: currentPath[0].y - Math.hypot(currentPath[1].x - currentPath[0].x, currentPath[1].y - currentPath[0].y),
                  width: Math.hypot(currentPath[1].x - currentPath[0].x, currentPath[1].y - currentPath[0].y) * 2,
                  height: Math.hypot(currentPath[1].x - currentPath[0].x, currentPath[1].y - currentPath[0].y) * 2,
                  borderRadius: Math.hypot(currentPath[1].x - currentPath[0].x, currentPath[1].y - currentPath[0].y),
                  opacity: 0.6,
                },
              ]}
            />
          )}

          {/* Current drawing path - rectangle preview */}
          {isDrawing && currentPath.length >= 2 && activeTool === 'rectangle' && (() => {
            const p1 = currentPath[0];
            const p2 = currentPath[1];
            const corners = [
              { x: p1.x, y: p1.y },
              { x: p2.x, y: p1.y },
              { x: p2.x, y: p2.y },
              { x: p1.x, y: p2.y },
            ];
            return (
              <View key="current-rect">
                {corners.map((point, idx) => {
                  const nextPoint = corners[(idx + 1) % corners.length];
                  const dx = nextPoint.x - point.x;
                  const dy = nextPoint.y - point.y;
                  const distance = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
                  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                  return (
                    <View
                      key={`current-rect-${idx}`}
                      style={[
                        styles.currentLineSegment,
                        {
                          left: (point.x + nextPoint.x) / 2 - distance / 2,
                          top: (point.y + nextPoint.y) / 2 - 1,
                          width: distance,
                          transform: [{ rotate: `${angle}deg` }],
                                                    opacity: 0.6,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            );
          })()}

          {/* Current drawing path - ellipse preview */}
          {isDrawing && currentPath.length >= 2 && activeTool === 'ellipse' && (() => {
            const center = currentPath[0];
            const edge = currentPath[1];
            const rx = Math.abs(edge.x - center.x);
            const ry = Math.abs(edge.y - center.y);
            const numSegments = 32;
            const ellipsePoints: Array<{ x: number; y: number }> = [];
            for (let i = 0; i <= numSegments; i++) {
              const angle = (i * Math.PI * 2) / numSegments;
              ellipsePoints.push({
                x: center.x + rx * Math.cos(angle),
                y: center.y + ry * Math.sin(angle),
              });
            }
            return (
              <View key="current-ellipse">
                {ellipsePoints.map((point, idx) => {
                  if (idx === 0) return null;
                  const prevPoint = ellipsePoints[idx - 1];
                  const dx = point.x - prevPoint.x;
                  const dy = point.y - prevPoint.y;
                  const distance = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
                  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                  return (
                    <View
                      key={`current-ellipse-${idx}`}
                      style={[
                        styles.currentLineSegment,
                        {
                          left: (prevPoint.x + point.x) / 2 - distance / 2,
                          top: (prevPoint.y + point.y) / 2 - 1,
                          width: distance,
                          transform: [{ rotate: `${angle}deg` }],
                                                    opacity: 0.6,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            );
          })()}

          {/* Current drawing path - arc preview */}
          {isDrawing && currentPath.length > 1 && activeTool === 'arc' && (
            <View key="current-arc">
              {currentPath.map((point, idx) => {
                if (idx === 0) return null;
                const prevPoint = currentPath[idx - 1];
                const dx = point.x - prevPoint.x;
                const dy = point.y - prevPoint.y;
                const distance = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                return (
                  <View
                    key={`current-arc-${idx}`}
                    style={[
                      styles.currentLineSegment,
                      {
                        left: (prevPoint.x + point.x) / 2 - distance / 2,
                        top: (prevPoint.y + point.y) / 2 - 1,
                        width: distance,
                        transform: [{ rotate: `${angle}deg` }],
                                                opacity: 0.6,
                      },
                    ]}
                  />
                );
              })}
            </View>
          )}

          {/* Current drawing path - spline/polygon preview */}
          {isDrawing && currentPath.length > 1 && (activeTool === 'spline' || activeTool === 'polygon') && (
            <View key="current-spline">
              {currentPath.map((point, idx) => {
                if (idx === 0) return null;
                const prevPoint = currentPath[idx - 1];
                const dx = point.x - prevPoint.x;
                const dy = point.y - prevPoint.y;
                const distance = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                return (
                  <View
                    key={`current-spline-${idx}`}
                    style={[
                      styles.currentLineSegment,
                      {
                        left: (prevPoint.x + point.x) / 2 - distance / 2,
                        top: (prevPoint.y + point.y) / 2 - 1,
                        width: distance,
                        transform: [{ rotate: `${angle}deg` }],
                                                opacity: 0.6,
                      },
                    ]}
                  />
                );
              })}
            </View>
          )}

          {/* Current drawing path - point preview */}
          {isDrawing && currentPath.length > 0 && activeTool === 'point' && (
            <View
              key="current-point"
              style={[
                styles.pointMarker,
                {
                  left: currentPath[0].x - 4,
                  top: currentPath[0].y - 4,
                  opacity: 0.7,
                },
              ]}
            />
          )}

          {/* N6: Dimension preview during drawing */}
          {isDrawing && currentPath.length >= 2 && activeTool === 'dimension' && (() => {
            const p1 = currentPath[0];
            const p2 = currentPath[currentPath.length - 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const pixelDist = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
            const realDist = pixelDist * metersPerPixel;
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            return (
              <View key="current-dimension">
                <View
                  style={[
                    styles.dimensionLine,
                    {
                      left: (p1.x + p2.x) / 2 - pixelDist / 2,
                      top: (p1.y + p2.y) / 2 - 0.5,
                      width: pixelDist,
                      transform: [{ rotate: `${angle}deg` }],
                      opacity: 0.7,
                    },
                  ]}
                />
                <View style={[styles.linePoint, { left: p1.x - 4, top: p1.y - 4, opacity: 0.7 }]} />
                <View style={[styles.linePoint, { left: p2.x - 4, top: p2.y - 4, opacity: 0.7 }]} />
                <View style={[styles.dimensionLabel, { left: midX - 25, top: midY - 10 }]}>
                  <Text style={styles.dimensionText}>{realDist.toFixed(1)}m</Text>
                </View>
              </View>
            );
          })()}

          {/* m11: Removed text/dimension tool press handlers that referenced onShowTextTool */}

          </View>{/* End canvasContent */}

          {/* N10: Zoom Controls */}
          <View style={styles.zoomControls}>
            <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom(z => Math.min(z * 1.25, 10))}>
              <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom(z => Math.max(z / 1.25, 0.25))}>
              <MaterialCommunityIcons name="minus" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomBtn} onPress={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}>
              <MaterialCommunityIcons name="fit-to-screen-outline" size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
          </View>

          {/* N7: Text input dialog for text tool */}
          {showTextInput && (
            <View style={styles.textInputDialog} pointerEvents="box-none">
              <View style={styles.textInputCard}>
                <Text style={styles.textInputTitle}>Enter Text</Text>
                <TextInput
                  style={styles.textInputField}
                  value={textInputValue}
                  onChangeText={setTextInputValue}
                  placeholder="Type text here..."
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleTextSubmit}
                />
                <View style={styles.textInputActions}>
                  <TouchableOpacity
                    style={styles.textInputCancel}
                    onPress={() => { setShowTextInput(false); setTextInputValue(''); }}
                  >
                    <Text style={styles.textInputCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.textInputConfirm} onPress={handleTextSubmit}>
                    <Text style={styles.textInputConfirmText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* m10: Loading overlay during DXF import */}
          {isImporting && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>Importing DXF...</Text>
            </View>
          )}
        </View>

        {/* Status Bar */}
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>
            Tool: {activeTool} | Zoom: {Math.round(zoom * 100)}% | Entities: {entities.length} | Scale: {metersPerPixel.toFixed(2)}m/px
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panelBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 60,
  },
  toolbarLeft: {
    flex: 1,
  },
  toolbarTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  toolbarCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 3,
    justifyContent: 'center',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  toolBtn: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 60,
  },
  toolBtnActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: colors.greenBtn,
  },
  toolBtnText: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  toolBtnTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  toolBtnDisabled: {
    opacity: 0.4,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.greenBtn,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 4,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  closeBtn: {
    backgroundColor: colors.redBtn,
    padding: 8,
    borderRadius: 6,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  canvasContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  zoomControls: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: colors.panelBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 2,
    zIndex: 30,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: colors.inputBg,
  },
  zoomLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  grid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: '#e5e7eb',
    opacity: 0.5,
  },
  entity: {
    position: 'absolute',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderWidth: 2,
    borderColor: colors.greenBtn,
    borderRadius: 4,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  entityContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  lineSegment: {
    position: 'absolute',
    height: 2,
    backgroundColor: colors.greenBtn,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  lineSegmentSelected: {
    backgroundColor: '#F59E0B',
    height: 3,
  },
  linePoint: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.greenBtn,
    borderWidth: 1,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  linePointSelected: {
    backgroundColor: '#F59E0B',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FBBF24',
  },
  pointMarker: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  pointMarkerSelected: {
    backgroundColor: '#F59E0B',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FBBF24',
  },
  currentLineSegment: {
    position: 'absolute',
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  currentLinePoint: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: '#ffffff',
    opacity: 0.8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  entityText: {
    position: 'absolute',
    fontSize: 10,
    color: colors.greenBtn,
    fontWeight: '600',
  },
  entityTextSelected: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },
  currentPath: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  pathText: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '600',
  },
  circle: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.blueBtn,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  circleSelected: {
    borderColor: '#F59E0B',
    borderWidth: 3,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  circleCenter: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.blueBtn,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  circleEdge: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  dimensionLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: '#F59E0B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 1,
  },
  dimensionLineSelected: {
    height: 2,
    backgroundColor: '#FBBF24',
  },
  dimensionLabel: {
    position: 'absolute',
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  dimensionLabelSelected: {
    backgroundColor: '#FBBF24',
  },
  dimensionText: {
    fontSize: 9,
    color: '#ffffff',
    fontWeight: '700',
  },
  statusBar: {
    backgroundColor: colors.panelBg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  loadingText: {
    color: '#ffffff',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Import/Export Buttons ──
  toolbarLeftActions: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  toolbarDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  importBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  importBtnActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    borderColor: '#60A5FA',
  },
  importBtnText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: colors.accent,
    letterSpacing: 0.5,
  },
  importBtnTextActive: {
    color: '#60A5FA',
  },
  exportBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 178, 111, 0.15)',
    borderWidth: 1,
    borderColor: colors.greenBtn,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  exportBtnText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: colors.greenBtn,
    letterSpacing: 0.5,
  },

  // ── Import Backdrop (dismiss tap area outside menu) ──
  importBackdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
  },

  // ── Import Dropdown Menu ──
  importMenu: {
    position: 'absolute' as const,
    top: 8,
    left: 8,
    backgroundColor: colors.panelBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 8,
    width: 200,
    zIndex: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  importMenuTitle: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: 'rgba(103, 232, 249, 0.7)',
    letterSpacing: 2,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  importOption: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  importOptionText: {
    flex: 1,
  },
  importOptionLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  importOptionSub: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 1,
  },
  importDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },

  // ── N3: Delete Button ──
  deleteBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  deleteBtnText: {
    fontSize: 9,
    fontWeight: '700' as const,
    color: '#EF4444',
  },

  // ── N7: Text Input Dialog ──
  textInputDialog: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 60,
  },
  textInputCard: {
    backgroundColor: colors.panelBg,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    padding: 16,
    width: 280,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  textInputTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: 12,
  },
  textInputField: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  textInputActions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  textInputCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textInputCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  textInputConfirm: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  textInputConfirmText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },

  // ── Line tool precision controls ──
  lineToolControls: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.panelBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  lineControlBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  lineControlBtnActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: colors.greenBtn,
  },
  lineControlText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: colors.textSecondary,
  },
  lineControlTextActive: {
    color: colors.greenBtn,
  },
  liveMeasurementLabel: {
    position: 'absolute' as const,
    backgroundColor: 'rgba(59, 130, 246, 0.88)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    zIndex: 10,
  },
  liveMeasurementText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '700' as const,
    fontFamily: 'monospace',
  },
});