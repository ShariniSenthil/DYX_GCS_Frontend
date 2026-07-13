// ============================================================
// CADAlignmentCanvas — DXF Viewer + Reference Point Selector
// ============================================================
//
// Renders a parsed CADModel on a canvas using SVG (react-native-svg).
// Allows the user to tap 2 points on the drawing to select as
// CAD reference points for georeferencing alignment.
//
// This component knows NOTHING about GPS or lat/lon.
// It only works in CAD local coordinates.

import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Svg, {
  G,
  Line as SvgLine,
  Polyline as SvgPolyline,
  Path,
  Circle as SvgCircle,
  Text as SvgText,
} from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import {
  CADModel,
  Entity,
  Line,
  PointEntity,
  Polyline,
  Arc,
  Point2D,
} from '../../core/geometry/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CANVAS_WIDTH = SCREEN_WIDTH - 32; // padding
const CANVAS_HEIGHT = SCREEN_HEIGHT * 0.5;

interface CADAlignmentCanvasProps {
  model: CADModel | null;
  onPointsSelected: (cadA: Point2D, cadB: Point2D) => void;
  onCancel: () => void;
}

// ============================================================
// Bounding Box + View Transform
// ============================================================

function computeModelBounds(entities: Entity[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const entity of entities) {
    switch (entity.type) {
      case 'Line': {
        minX = Math.min(minX, entity.start.x, entity.end.x);
        minY = Math.min(minY, entity.start.y, entity.end.y);
        maxX = Math.max(maxX, entity.start.x, entity.end.x);
        maxY = Math.max(maxY, entity.start.y, entity.end.y);
        break;
      }
      case 'Point': {
        minX = Math.min(minX, entity.position.x);
        minY = Math.min(minY, entity.position.y);
        maxX = Math.max(maxX, entity.position.x);
        maxY = Math.max(maxY, entity.position.y);
        break;
      }
      case 'Polyline': {
        minX = Math.min(minX, entity.startPoint.x);
        minY = Math.min(minY, entity.startPoint.y);
        maxX = Math.max(maxX, entity.startPoint.x);
        maxY = Math.max(maxY, entity.startPoint.y);
        for (const seg of entity.segments) {
          minX = Math.min(minX, seg.to.x);
          minY = Math.min(minY, seg.to.y);
          maxX = Math.max(maxX, seg.to.x);
          maxY = Math.max(maxY, seg.to.y);
          if (seg.segmentType === 'Arc') {
            minX = Math.min(minX, seg.center.x - seg.radius);
            minY = Math.min(minY, seg.center.y - seg.radius);
            maxX = Math.max(maxX, seg.center.x + seg.radius);
            maxY = Math.max(maxY, seg.center.y + seg.radius);
          }
        }
        break;
      }
      case 'Arc': {
        minX = Math.min(minX, entity.center.x - entity.radius);
        minY = Math.min(minY, entity.center.y - entity.radius);
        maxX = Math.max(maxX, entity.center.x + entity.radius);
        maxY = Math.max(maxY, entity.center.y + entity.radius);
        break;
      }
    }
  }

  return {
    minX: isFinite(minX) ? minX : 0,
    minY: isFinite(minY) ? minY : 0,
    maxX: isFinite(maxX) ? maxX : 0,
    maxY: isFinite(maxY) ? maxY : 0,
  };
}

// ============================================================
// Coordinate Conversion: CAD → Screen
// ============================================================

interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function computeViewTransform(bounds: ReturnType<typeof computeModelBounds>): ViewTransform {
  const modelWidth = bounds.maxX - bounds.minX || 1;
  const modelHeight = bounds.maxY - bounds.minY || 1;
  const padding = 40;

  const scaleX = (CANVAS_WIDTH - 2 * padding) / modelWidth;
  const scaleY = (CANVAS_HEIGHT - 2 * padding) / modelHeight;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = (CANVAS_WIDTH - modelWidth * scale) / 2 - bounds.minX * scale;
  // Flip Y: CAD Y-up → screen Y-down
  const offsetY = (CANVAS_HEIGHT + modelHeight * scale) / 2 + bounds.minY * scale;

  return { scale, offsetX, offsetY };
}

function toScreen(p: Point2D, t: ViewTransform): Point2D {
  return {
    x: p.x * t.scale + t.offsetX,
    y: -p.y * t.scale + t.offsetY,
  };
}

function toCAD(screenX: number, screenY: number, t: ViewTransform): Point2D {
  return {
    x: (screenX - t.offsetX) / t.scale,
    y: -(screenY - t.offsetY) / t.scale,
  };
}

// ============================================================
// Arc Path Generation (SVG d attribute)
// ============================================================

function arcToPathD(
  center: Point2D,
  radius: number,
  startAngle: number,
  endAngle: number,
  t: ViewTransform
): string {
  const sweep = endAngle - startAngle;
  const steps = Math.max(36, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
  let d = '';

  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + sweep * (i / steps);
    const cx = center.x + radius * Math.cos(angle);
    const cy = center.y + radius * Math.sin(angle);
    const sp = toScreen({ x: cx, y: cy }, t);

    if (i === 0) {
      d += `M ${sp.x} ${sp.y}`;
    } else {
      d += ` L ${sp.x} ${sp.y}`;
    }
  }

  return d;
}

// ============================================================
// Component
// ============================================================

export const CADAlignmentCanvas: React.FC<CADAlignmentCanvasProps> = ({
  model,
  onPointsSelected,
  onCancel,
}) => {
  const [selectedPoints, setSelectedPoints] = useState<Point2D[]>([]);
  const svgRef = useRef<View>(null);

  // Compute view transform once
  const { bounds, transform } = useMemo(() => {
    if (!model) return { bounds: null, transform: null };
    const b = computeModelBounds(model.entities);
    const t = computeViewTransform(b);
    return { bounds: b, transform: t };
  }, [model]);

  // Handle canvas tap → select CAD reference point
  const handleCanvasPress = useCallback(
    (event: any) => {
      if (!transform) return;
      if (selectedPoints.length >= 2) return; // already done

      const { locationX, locationY } = event.nativeEvent;
      const cadPoint = toCAD(locationX, locationY, transform);

      const newPoints = [...selectedPoints, cadPoint];
      setSelectedPoints(newPoints);

      if (newPoints.length === 2) {
        onPointsSelected(newPoints[0], newPoints[1]);
      }
    },
    [transform, selectedPoints, onPointsSelected]
  );

  if (!model || !transform || !bounds) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No CAD model loaded</Text>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================================
  // Render Entities
  // ============================================================

  const renderEntity = (entity: Entity, index: number) => {
    switch (entity.type) {
      case 'Line': {
        const sp = toScreen(entity.start, transform);
        const ep = toScreen(entity.end, transform);
        return (
          <SvgLine
            key={entity.id}
            x1={sp.x}
            y1={sp.y}
            x2={ep.x}
            y2={ep.y}
            stroke={colors.cyan}
            strokeWidth={1.5}
          />
        );
      }

      case 'Point': {
        const sp = toScreen(entity.position, transform);
        return (
          <SvgCircle
            key={entity.id}
            cx={sp.x}
            cy={sp.y}
            r={4}
            fill={colors.yellow}
          />
        );
      }

      case 'Polyline': {
        const pts: Point2D[] = [entity.startPoint, ...entity.segments.map((s) => s.to)];
        const screenPts = pts.map((p) => toScreen(p, transform));

        // Build SVG path for polyline (handles arc segments)
        let d = `M ${screenPts[0].x} ${screenPts[0].y}`;

        for (let i = 0; i < entity.segments.length; i++) {
          const seg = entity.segments[i];
          const toPt = screenPts[i + 1];

          if (seg.segmentType === 'Arc') {
            const centerScreen = toScreen(seg.center, transform);
            const r = seg.radius * transform.scale;
            const sweep = seg.endAngle - seg.startAngle;
            const sweepFlag = sweep > 0 ? 1 : 0;
            const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
            d += ` A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${toPt.x} ${toPt.y}`;
          } else {
            d += ` L ${toPt.x} ${toPt.y}`;
          }
        }

        if (entity.closed && screenPts.length > 2) {
          d += ` L ${screenPts[0].x} ${screenPts[0].y}`;
        }

        return <Path key={entity.id} d={d} stroke={colors.cyan} strokeWidth={1.5} fill="none" />;
      }

      case 'Arc': {
        const d = arcToPathD(entity.center, entity.radius, entity.startAngle, entity.endAngle, transform);
        return <Path key={entity.id} d={d} stroke={colors.magenta} strokeWidth={1.5} fill="none" />;
      }
    }
  };

  // ============================================================
  // Render Selected Points
  // ============================================================

  const renderSelectedPoints = () => {
    return selectedPoints.map((pt, i) => {
      const sp = toScreen(pt, transform);
      const label = i === 0 ? 'A' : 'B';
      return (
        <G key={`sel-${i}`}>
          <SvgCircle cx={sp.x} cy={sp.y} r={8} fill="none" stroke={colors.red} strokeWidth={2} />
          <SvgCircle cx={sp.x} cy={sp.y} r={3} fill={colors.red} />
          <SvgText
            x={sp.x + 12}
            y={sp.y - 12}
            fontSize={14}
            fontWeight="bold"
            fill={colors.red}
          >
            {label}
          </SvgText>
        </G>
      );
    });
  };

  // ============================================================
  // Status Bar
  // ============================================================

  const statusText = selectedPoints.length === 0
    ? 'Tap point A on the drawing'
    : selectedPoints.length === 1
      ? 'Tap point B on the drawing'
      : 'Alignment points selected ✓';

  // ============================================================
  // Main Render
  // ============================================================

  return (
    <View style={styles.container}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <MaterialCommunityIcons
          name={selectedPoints.length === 0 ? 'gesture-tap' : selectedPoints.length === 1 ? 'gesture-tap-button' : 'check-circle'}
          size={20}
          color={selectedPoints.length < 2 ? colors.yellow : colors.green}
        />
        <Text style={[styles.statusText, { color: selectedPoints.length < 2 ? colors.text : colors.green }]}>
          {statusText}
        </Text>
        <TouchableOpacity style={styles.cancelButtonSmall} onPress={onCancel}>
          <Text style={styles.cancelButtonTextSmall}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Canvas */}
      <View style={styles.canvasWrapper}>
        <Svg
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={styles.canvas}
          onPress={handleCanvasPress}
        >
          <G>
            {/* Grid (subtle) */}
            {bounds && renderGrid(bounds, transform)}
            {/* Entities */}
            {model.entities.map((entity, i) => renderEntity(entity, i))}
            {/* Selected reference points */}
            {renderSelectedPoints()}
          </G>
        </Svg>
      </View>

      {/* Entity count */}
      <Text style={styles.entityCount}>
        {model.entities.length} entities • {model.units} (scale: {model.unitScale}×)
      </Text>
    </View>
  );
};

// ============================================================
// Grid Rendering Helper
// ============================================================

function renderGrid(
  bounds: ReturnType<typeof computeModelBounds>,
  transform: ViewTransform
) {
  const gridColor = colors.surface + '40'; // transparent
  const elements: React.ReactElement[] = [];

  // Compute grid spacing based on model size
  const modelWidth = bounds.maxX - bounds.minX;
  const modelHeight = bounds.maxY - bounds.minY;
  const roughGridSize = Math.max(modelWidth, modelHeight) / 10;

  const startX = Math.floor(bounds.minX / roughGridSize) * roughGridSize;
  const startY = Math.floor(bounds.minY / roughGridSize) * roughGridSize;
  const endX = Math.ceil(bounds.maxX / roughGridSize) * roughGridSize;
  const endY = Math.ceil(bounds.maxY / roughGridSize) * roughGridSize;

  // Vertical lines
  for (let x = startX; x <= endX; x += roughGridSize) {
    const sp1 = toScreen({ x, y: bounds.minY }, transform);
    const sp2 = toScreen({ x, y: bounds.maxY }, transform);
    elements.push(
      <SvgLine key={`gv-${x}`} x1={sp1.x} y1={sp1.y} x2={sp2.x} y2={sp2.y} stroke={gridColor} strokeWidth={0.5} />
    );
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y += roughGridSize) {
    const sp1 = toScreen({ x: bounds.minX, y }, transform);
    const sp2 = toScreen({ x: bounds.maxX, y }, transform);
    elements.push(
      <SvgLine key={`gh-${y}`} x1={sp1.x} y1={sp1.y} x2={sp2.x} y2={sp2.y} stroke={gridColor} strokeWidth={0.5} />
    );
  }

  return elements;
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  canvasWrapper: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  canvas: {
    backgroundColor: colors.background + 'CC',
  },
  entityCount: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 14,
    textAlign: 'center',
    padding: 40,
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: colors.redBtn,
    borderRadius: 8,
    alignSelf: 'center',
  },
  cancelButtonText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  cancelButtonSmall: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.redBtn + 'CC',
    borderRadius: 6,
  },
  cancelButtonTextSmall: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 11,
  },
});
