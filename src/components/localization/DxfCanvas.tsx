// ============================================================
// DxfCanvas — DXF point-set viewer with pan/zoom/tap
// ============================================================
//
// Renders a ParsedPointSet on an SVG canvas using react-native-svg.
// Supports single-finger pan and two-finger pinch-to-zoom.
// Hit-tests taps against rendered points within 20 screen pixels.
//
// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
import Svg, {
  G,
  Line as SvgLine,
  Circle as SvgCircle,
  Polyline as SvgPolyline,
} from 'react-native-svg';
import { colors } from '../../theme/colors';
import { ParsedPoint, ParsedPointSet } from '../../core/geometry/parsedPoint';
import {
  Viewport,
  toScreen,
  computeAutoFitViewport,
  pickNearestPoint,
} from './canvas.helpers';

// ── Props ─────────────────────────────────────────────────────

export interface DxfCanvasProps {
  points: ParsedPointSet;
  selectedId: string | null;
  viewport: Viewport;
  showTransformed: boolean;
  onViewportChange: (v: Viewport) => void;
  onPointTap: (id: string) => void;
  onBackgroundTap: () => void;
}

// ── Helpers ───────────────────────────────────────────────────

/** Euclidean distance between two touches. */
function touchDistance(
  t1: { pageX: number; pageY: number },
  t2: { pageX: number; pageY: number }
): number {
  const dx = t1.pageX - t2.pageX;
  const dy = t1.pageY - t2.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Draw-order grouping ───────────────────────────────────────

/**
 * Group consecutive points that share the same sourceEntity identity
 * (same kind + same geometric parameters) into runs for polyline rendering.
 *
 * For CIRCLE: group by (cx, cy, r).
 * For ARC:    group by (cx, cy, r, startAngleDeg, endAngleDeg).
 * For LINE/LWPOLYLINE: group by entity identity (start/end or vertices reference).
 *
 * Returns an array of groups, each being an array of ParsedPoints.
 */
function groupBySourceEntity(points: ReadonlyArray<ParsedPoint>): ParsedPoint[][] {
  if (points.length === 0) return [];

  const groups: ParsedPoint[][] = [];
  let currentGroup: ParsedPoint[] = [points[0]];
  let currentKey = entityKey(points[0]);

  for (let i = 1; i < points.length; i++) {
    const key = entityKey(points[i]);
    if (key === currentKey) {
      currentGroup.push(points[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [points[i]];
      currentKey = key;
    }
  }
  groups.push(currentGroup);
  return groups;
}

function entityKey(p: ParsedPoint): string {
  const e = p.sourceEntity;
  switch (e.kind) {
    case 'CIRCLE':
      return `CIRCLE:${e.cx}:${e.cy}:${e.r}`;
    case 'ARC':
      return `ARC:${e.cx}:${e.cy}:${e.r}:${e.startAngleDeg}:${e.endAngleDeg}`;
    case 'LINE':
      return `LINE:${e.start.x}:${e.start.y}:${e.end.x}:${e.end.y}`;
    case 'LWPOLYLINE':
      // Use the first vertex as a stable key; vertexIndex 0 is always present
      return `LWPOLYLINE:${e.vertices[0]?.x}:${e.vertices[0]?.y}:${e.vertices.length}:${e.closed}`;
  }
}

// ── Component ─────────────────────────────────────────────────

export const DxfCanvas: React.FC<DxfCanvasProps> = ({
  points,
  selectedId,
  viewport,
  showTransformed,
  onViewportChange,
  onPointTap,
  onBackgroundTap,
}) => {
  // Canvas dimensions from onLayout
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const autoFitDone = useRef(false);

  // Gesture tracking refs (mutable, no re-render needed)
  const panRef = useRef<{ panX: number; panY: number; zoom: number }>({
    panX: viewport.panX,
    panY: viewport.panY,
    zoom: viewport.zoom,
  });
  const lastSingleTouch = useRef<{ x: number; y: number } | null>(null);
  const lastTwoTouchDist = useRef<number | null>(null);
  const isTap = useRef(false);
  const tapPos = useRef<{ x: number; y: number } | null>(null);

  // Prop refs: PanResponder is created once (via useRef) so its callbacks
  // close over initial prop values. These refs give callbacks access to the
  // latest values without recreating the PanResponder on every render.
  const pointsRef = useRef(points);
  const onPointTapRef = useRef(onPointTap);

  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { onPointTapRef.current = onPointTap; }, [onPointTap]);

  // Keep panRef in sync when viewport prop changes externally
  useEffect(() => {
    panRef.current = { panX: viewport.panX, panY: viewport.panY, zoom: viewport.zoom };
  }, [viewport]);

  // Auto-fit on mount once canvas size is known
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setCanvasSize({ width, height });

      if (!autoFitDone.current && points.length > 0) {
        autoFitDone.current = true;
        const fitted = computeAutoFitViewport(points, width, height);
        panRef.current = { panX: fitted.panX, panY: fitted.panY, zoom: fitted.zoom };
        onViewportChange(fitted);
      }
    },
    [points, onViewportChange]
  );

  // Re-run auto-fit when points change (new file loaded)
  useEffect(() => {
    autoFitDone.current = false;
    if (canvasSize && points.length > 0) {
      autoFitDone.current = true;
      const fitted = computeAutoFitViewport(points, canvasSize.width, canvasSize.height);
      panRef.current = { panX: fitted.panX, panY: fitted.panY, zoom: fitted.zoom };
      onViewportChange(fitted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // ── PanResponder ────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        isTap.current = true;
        tapPos.current = {
          x: evt.nativeEvent.locationX,
          y: evt.nativeEvent.locationY,
        };

        if (touches.length === 1) {
          lastSingleTouch.current = { x: touches[0].pageX, y: touches[0].pageY };
          lastTwoTouchDist.current = null;
        } else if (touches.length >= 2) {
          lastTwoTouchDist.current = touchDistance(touches[0], touches[1]);
          lastSingleTouch.current = null;
          isTap.current = false;
        }
      },

      onPanResponderMove: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        isTap.current = false; // any movement cancels tap

        if (touches.length === 1 && lastSingleTouch.current) {
          // Single-finger pan
          const dx = touches[0].pageX - lastSingleTouch.current.x;
          const dy = touches[0].pageY - lastSingleTouch.current.y;
          lastSingleTouch.current = { x: touches[0].pageX, y: touches[0].pageY };

          const next: Viewport = {
            panX: panRef.current.panX + dx,
            panY: panRef.current.panY + dy,
            zoom: panRef.current.zoom,
          };
          panRef.current = next;
          onViewportChange(next);
        } else if (touches.length >= 2) {
          // Two-finger pinch
          const newDist = touchDistance(touches[0], touches[1]);
          if (lastTwoTouchDist.current !== null && lastTwoTouchDist.current > 0) {
            const scale = newDist / lastTwoTouchDist.current;
            // Zoom around the midpoint of the two touches
            const midX = (touches[0].pageX + touches[1].pageX) / 2;
            const midY = (touches[0].pageY + touches[1].pageY) / 2;
            const oldZoom = panRef.current.zoom;
            const newZoom = Math.max(0.01, Math.min(1000, oldZoom * scale));
            // Adjust pan so the midpoint stays fixed on screen
            const next: Viewport = {
              zoom: newZoom,
              panX: midX - (midX - panRef.current.panX) * (newZoom / oldZoom),
              panY: midY - (midY - panRef.current.panY) * (newZoom / oldZoom),
            };
            panRef.current = next;
            onViewportChange(next);
          }
          lastTwoTouchDist.current = newDist;
          lastSingleTouch.current = null;
        }
      },

      onPanResponderRelease: (evt: GestureResponderEvent) => {
        if (isTap.current && tapPos.current) {
          const { x, y } = tapPos.current;
          const hit = pickNearestPoint(pointsRef.current, panRef.current, { sx: x, sy: y }, 20);
          if (hit !== null) {
            onPointTapRef.current(hit);
          }
          // Per Requirement 9.4: if no point within 20px, leave selection unchanged.
          // onBackgroundTap is available but spec says do NOT change selection on background tap.
        }
        lastSingleTouch.current = null;
        lastTwoTouchDist.current = null;
        isTap.current = false;
        tapPos.current = null;
      },

      onPanResponderTerminate: () => {
        lastSingleTouch.current = null;
        lastTwoTouchDist.current = null;
        isTap.current = false;
        tapPos.current = null;
      },
    })
  ).current;

  // ── Placeholder ─────────────────────────────────────────────

  if (points.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Import a DXF file to begin</Text>
        </View>
      </View>
    );
  }

  // ── Partition points by entity type for draw order ───────────

  const arcCirclePoints = points.filter(
    (p) => p.entityType === 'ARC' || p.entityType === 'CIRCLE'
  );
  const linePolylinePoints = points.filter(
    (p) => p.entityType === 'LINE' || p.entityType === 'LWPOLYLINE'
  );

  // Group into runs for polyline rendering
  const arcCircleGroups = groupBySourceEntity(arcCirclePoints);
  const linePolylineGroups = groupBySourceEntity(linePolylinePoints);

  // ── Render helpers ───────────────────────────────────────────

  const getPointColor = (p: ParsedPoint): string => {
    if (p.id === selectedId) return colors.warning;
    if (showTransformed && p.isTransformed) return colors.success;
    return colors.accent;
  };

  const getPointRadius = (p: ParsedPoint): number => {
    return p.id === selectedId ? 7 : 4;
  };

  /** Render a group of points as a polyline (for ARC/CIRCLE/LINE/LWPOLYLINE). */
  const renderPolylineGroup = (group: ParsedPoint[], key: string) => {
    if (group.length < 2) return null;

    const pointsStr = group
      .map((p) => {
        const s = toScreen(p.sourceX, p.sourceY, viewport);
        return `${s.x},${s.y}`;
      })
      .join(' ');

    // Color from first point in group
    const strokeColor =
      showTransformed && group[0].isTransformed ? colors.success : colors.accent;

    return (
      <SvgPolyline
        key={key}
        points={pointsStr}
        stroke={strokeColor}
        strokeWidth={1.5}
        fill="none"
        opacity={0.7}
      />
    );
  };

  /** Render individual point markers (top layer). */
  const renderPointMarkers = () => {
    return points.map((p) => {
      const s = toScreen(p.sourceX, p.sourceY, viewport);
      return (
        <SvgCircle
          key={p.id}
          cx={s.x}
          cy={s.y}
          r={getPointRadius(p)}
          fill={getPointColor(p)}
          stroke={p.id === selectedId ? colors.text : 'none'}
          strokeWidth={p.id === selectedId ? 1.5 : 0}
        />
      );
    });
  };

  // ── Main render ──────────────────────────────────────────────

  return (
    <View
      style={styles.container}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      {canvasSize && (
        <Svg
          width={canvasSize.width}
          height={canvasSize.height}
          style={styles.svg}
        >
          {/* Layer 1 (bottom): ARC/CIRCLE tessellated polylines */}
          <G>
            {arcCircleGroups.map((group, i) =>
              renderPolylineGroup(group, `arc-circle-${i}`)
            )}
          </G>

          {/* Layer 2: LINE/LWPOLYLINE segments */}
          <G>
            {linePolylineGroups.map((group, i) => {
              if (group.length === 1) {
                // Single point — render as a small line segment stub
                const s = toScreen(group[0].sourceX, group[0].sourceY, viewport);
                const strokeColor =
                  showTransformed && group[0].isTransformed
                    ? colors.success
                    : colors.accent;
                return (
                  <SvgLine
                    key={`line-single-${i}`}
                    x1={s.x - 2}
                    y1={s.y}
                    x2={s.x + 2}
                    y2={s.y}
                    stroke={strokeColor}
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
                );
              }
              return renderPolylineGroup(group, `line-poly-${i}`);
            })}
          </G>

          {/* Layer 3 (top): Individual point markers */}
          <G>{renderPointMarkers()}</G>
        </Svg>
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  svg: {
    backgroundColor: colors.background,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
    textAlign: 'center',
  },
});
