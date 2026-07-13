// ============================================================
// CAD Dimension Annotation Component
// ============================================================
//
// Renders dimension annotations on canvas - lines, arrows,
// and text labels for smart dimension editing.

import React, { useMemo } from 'react';
import { G, Line as SvgLine, Text as SvgText, Circle as SvgCircle, Path as SvgPath, Rect as SvgRect } from 'react-native-svg';
import { Viewport, worldToScreen } from '../../core/cad';
import { DimensionAnnotation, DimensionStyle, DEFAULT_DIMENSION_STYLE } from './types/dimension';

interface CADimensionAnnotationProps {
  /** Dimension data to render */
  dimension: DimensionAnnotation;

  /** Current viewport for coordinate transformation */
  viewport: Viewport;

  /** Canvas dimensions for bounds checking */
  canvasSize: { width: number; height: number };

  /** Callback when dimension is pressed */
  onPress?: (dimension: DimensionAnnotation) => void;

  /** Custom dimension style */
  style?: Partial<DimensionStyle>;
}

/**
 * Renders a single dimension annotation with lines, arrows, and text
 */
export const CADimensionAnnotation: React.FC<CADimensionAnnotationProps> = ({
  dimension,
  viewport,
  canvasSize,
  onPress,
  style: customStyle,
}) => {
  // Transform world points to screen coordinates
  const screenPoints = useMemo(() => {
    return dimension.points.map(point => worldToScreen(point, viewport));
  }, [dimension.points, viewport]);

  const labelScreenPos = useMemo(() => {
    return worldToScreen(dimension.labelPosition, viewport);
  }, [dimension.labelPosition, viewport]);

  // Don't render if all points are outside viewport
  const isInViewport = useMemo(() => {
    return screenPoints.some(p =>
      p.x >= -50 && p.x <= canvasSize.width + 50 &&
      p.y >= -50 && p.y <= canvasSize.height + 50
    );
  }, [screenPoints, canvasSize]);

  if (!isInViewport) {
    return null;
  }

  const handlePress = () => {
    if (onPress && dimension.editable) {
      onPress(dimension);
    }
  };

  return (
    <G onPress={handlePress} pointerEvents="box-none">
      {dimension.type === 'linear' || dimension.type === 'horizontal' || dimension.type === 'vertical' ? (
        <LinearDimension
          dimension={dimension}
          screenPoints={screenPoints}
          labelScreenPos={labelScreenPos}
          customStyle={customStyle}
        />
      ) : dimension.type === 'angular' ? (
        <AngularDimension
          dimension={dimension}
          screenPoints={screenPoints}
          labelScreenPos={labelScreenPos}
          customStyle={customStyle}
        />
      ) : dimension.type === 'radial' || dimension.type === 'diameter' ? (
        <RadialDimension
          dimension={dimension}
          screenPoints={screenPoints}
          labelScreenPos={labelScreenPos}
          customStyle={customStyle}
        />
      ) : dimension.type === 'coordinate' ? (
        <CoordinateDimension
          dimension={dimension}
          screenPoints={screenPoints}
          labelScreenPos={labelScreenPos}
          customStyle={customStyle}
        />
      ) : null}

      {/* Invisible touch area */}
      <SvgRect
        x={labelScreenPos.x - 40}
        y={labelScreenPos.y - 15}
        width={80}
        height={30}
        fill="transparent"
        onPress={handlePress}
        pointerEvents="auto"
      />
    </G>
  );
};

/**
 * Linear dimension (distance, horizontal, vertical)
 */
const LinearDimension: React.FC<{
  dimension: DimensionAnnotation;
  screenPoints: Array<{ x: number; y: number }>;
  labelScreenPos: { x: number; y: number };
  customStyle?: Partial<DimensionStyle>;
}> = ({ dimension, screenPoints, labelScreenPos, customStyle }) => {
  const style = { ...DEFAULT_DIMENSION_STYLE, ...customStyle };

  if (screenPoints.length < 2) return null;

  const [p1, p2] = screenPoints;
  const isHorizontal = dimension.type === 'horizontal';
  const isVertical = dimension.type === 'vertical';

  // Extension lines (from geometry to dimension line)
  const extensionOffset = style.extensionOffset;
  const extensionLength = 10;

  return (
    <G>
      {/* Extension lines */}
      <SvgLine
        x1={p1.x} y1={p1.y}
        x2={p1.x} y2={isHorizontal ? p1.y - extensionOffset : p1.y - extensionOffset}
        stroke={style.lineColor}
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <SvgLine
        x1={p2.x} y1={p2.y}
        x2={p2.x} y2={isHorizontal ? p2.y - extensionOffset : isVertical ? p2.y : p2.y - extensionOffset}
        stroke={style.lineColor}
        strokeWidth={1}
        strokeDasharray="2 2"
      />

      {/* Dimension line */}
      <SvgLine
        x1={p1.x} y1={isHorizontal ? p1.y - extensionOffset : isVertical ? p1.y : p1.y - extensionOffset}
        x2={p2.x} y2={isHorizontal ? p2.y - extensionOffset : isVertical ? p2.y : p2.y - extensionOffset}
        stroke={dimension.color}
        strokeWidth={dimension.strokeWidth}
      />

      {/* Arrows */}
      <DimensionArrow
        x1={p1.x} y1={isHorizontal ? p1.y - extensionOffset : isVertical ? p1.y : p1.y - extensionOffset}
        x2={p2.x} y2={isHorizontal ? p2.y - extensionOffset : isVertical ? p2.y : p2.y - extensionOffset}
        size={style.arrowSize}
        color={dimension.color}
      />

      {/* Dimension label */}
      <DimensionLabel
        text={dimension.label}
        x={labelScreenPos.x}
        y={labelScreenPos.y}
        style={style}
      />
    </G>
  );
};

/**
 * Angular dimension (angle between lines)
 */
const AngularDimension: React.FC<{
  dimension: DimensionAnnotation;
  screenPoints: Array<{ x: number; y: number }>;
  labelScreenPos: { x: number; y: number };
  customStyle?: Partial<DimensionStyle>;
}> = ({ dimension, screenPoints, labelScreenPos, customStyle }) => {
  const style = { ...DEFAULT_DIMENSION_STYLE, ...customStyle };

  if (screenPoints.length < 2) return null;

  const [p1, p2] = screenPoints;

  return (
    <G>
      {/* Arc representing angle */}
      <SvgCircle
        cx={p1.x} cy={p1.y}
        r={25}
        fill="none"
        stroke={dimension.color}
        strokeWidth={dimension.strokeWidth}
        strokeDasharray="4 2"
      />

      {/* Angle indicator lines */}
      <SvgLine
        x1={p1.x} y1={p1.y}
        x2={p1.x + 20} y2={p1.y}
        stroke={dimension.color}
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <SvgLine
        x1={p1.x} y1={p1.y}
        x2={p2.x} y2={p2.y}
        stroke={dimension.color}
        strokeWidth={1}
        strokeDasharray="2 2"
      />

      {/* Dimension label */}
      <DimensionLabel
        text={dimension.label}
        x={labelScreenPos.x}
        y={labelScreenPos.y}
        style={style}
      />
    </G>
  );
};

/**
 * Radial dimension (radius, diameter)
 */
const RadialDimension: React.FC<{
  dimension: DimensionAnnotation;
  screenPoints: Array<{ x: number; y: number }>;
  labelScreenPos: { x: number; y: number };
  customStyle?: Partial<DimensionStyle>;
}> = ({ dimension, screenPoints, labelScreenPos, customStyle }) => {
  const style = { ...DEFAULT_DIMENSION_STYLE, ...customStyle };

  if (screenPoints.length < 1) return null;

  const center = screenPoints[0];

  return (
    <G>
      {/* Radius line */}
      <SvgLine
        x1={center.x} y1={center.y}
        x2={labelScreenPos.x} y2={labelScreenPos.y}
        stroke={dimension.color}
        strokeWidth={dimension.strokeWidth}
        strokeDasharray="3 3"
      />

      {/* Arrow at label position */}
      <SvgCircle
        cx={labelScreenPos.x} cy={labelScreenPos.y}
        r={3}
        fill={dimension.color}
      />

      {/* Center marker */}
      <SvgCircle
        cx={center.x} cy={center.y}
        r={4}
        fill={dimension.color}
      />

      {/* Dimension label */}
      <DimensionLabel
        text={dimension.label}
        x={labelScreenPos.x + 10}
        y={labelScreenPos.y - 10}
        style={style}
      />
    </G>
  );
};

/**
 * Coordinate dimension (X/Y position)
 */
const CoordinateDimension: React.FC<{
  dimension: DimensionAnnotation;
  screenPoints: Array<{ x: number; y: number }>;
  labelScreenPos: { x: number; y: number };
  customStyle?: Partial<DimensionStyle>;
}> = ({ dimension, screenPoints, labelScreenPos, customStyle }) => {
  const style = { ...DEFAULT_DIMENSION_STYLE, ...customStyle };

  if (screenPoints.length < 1) return null;

  const point = screenPoints[0];

  return (
    <G>
      {/* Point marker */}
      <SvgCircle
        cx={point.x} cy={point.y}
        r={5}
        fill={dimension.color}
      />

      {/* Extension line to label */}
      <SvgLine
        x1={point.x} y1={point.y}
        x2={labelScreenPos.x} y2={labelScreenPos.y}
        stroke={dimension.color}
        strokeWidth={1}
        strokeDasharray="2 2"
      />

      {/* Dimension label */}
      <DimensionLabel
        text={dimension.label}
        x={labelScreenPos.x}
        y={labelScreenPos.y}
        style={style}
      />
    </G>
  );
};

/**
 * Dimension arrows (both ends)
 */
const DimensionArrow: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
  color: string;
}> = ({ x1, y1, x2, y2, size, color }) => {
  const angle1 = Math.atan2(y1 - y2, x1 - x2);
  const angle2 = Math.atan2(y2 - y1, x2 - x1);

  return (
    <G>
      {/* Arrow at point 1 */}
      <SvgPath
        d={`M ${x1} ${y1} L ${x1 + size * Math.cos(angle1 + Math.PI / 6)} ${y1 + size * Math.sin(angle1 + Math.PI / 6)} L ${x1 + size * Math.cos(angle1 - Math.PI / 6)} ${y1 + size * Math.sin(angle1 - Math.PI / 6)} Z`}
        fill={color}
      />
      {/* Arrow at point 2 */}
      <SvgPath
        d={`M ${x2} ${y2} L ${x2 + size * Math.cos(angle2 + Math.PI / 6)} ${y2 + size * Math.sin(angle2 + Math.PI / 6)} L ${x2 + size * Math.cos(angle2 - Math.PI / 6)} ${y2 + size * Math.sin(angle2 - Math.PI / 6)} Z`}
        fill={color}
      />
    </G>
  );
};

/**
 * Dimension label with background
 */
const DimensionLabel: React.FC<{
  text: string;
  x: number;
  y: number;
  style: DimensionStyle;
}> = ({ text, x, y, style }) => {
  // Calculate text bounding box (approximate)
  const textWidth = text.length * style.fontSize * 0.6;
  const textHeight = style.fontSize * 1.2;
  const padding = 4;

  return (
    <G>
      {/* Background rectangle */}
      <SvgRect
        x={x - textWidth / 2 - padding}
        y={y - textHeight / 2 - padding}
        width={textWidth + padding * 2}
        height={textHeight + padding * 2}
        fill={style.textBackgroundColor}
        rx={4}
      />

      {/* Text */}
      <SvgText
        x={x}
        y={y}
        fontSize={style.fontSize}
        fill={style.textColor}
        textAnchor="middle"
        fontWeight="600"
      >
        {text}
      </SvgText>
    </G>
  );
};