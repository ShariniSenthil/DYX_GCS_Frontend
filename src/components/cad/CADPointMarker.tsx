// ============================================================
// CAD Point Marker Component
// ============================================================
//
// Visual feedback for point selection in smart dimension editing.
// Shows selectable points on CAD entities (vertices, centers, endpoints).

import React, { useMemo } from 'react';
import { G, Circle as SvgCircle, Rect as SvgRect } from 'react-native-svg';
import { Viewport, worldToScreen } from '../../core/cad';
import { PointMarker } from './types/selection';

interface CADPointMarkerProps {
  /** Marker data */
  marker: PointMarker;

  /** Current viewport for coordinate transformation */
  viewport: Viewport;

  /** Callback when marker is pressed */
  onPress?: (marker: PointMarker) => void;

  /** Callback when marker is hovered (if platform supports hover) */
  onHover?: (marker: PointMarker, isHovered: boolean) => void;
}

/**
 * Renders visual markers for selectable points on CAD entities
 */
export const CADPointMarker: React.FC<CADPointMarkerProps> = ({
  marker,
  viewport,
  onPress,
  onHover,
}) => {
  // Transform world position to screen coordinates
  const screenPos = useMemo(() => {
    return worldToScreen(marker.position, viewport);
  }, [marker.position, viewport]);

  // Don't render if outside viewport
  if (screenPos.x < -20 || screenPos.y < -20) {
    return null;
  }

  // Determine marker appearance based on type and state
  const markerStyle = useMemo(() => {
    const size = marker.size;
    const isSelected = marker.isSelected;
    const isHovered = marker.isHovered;

    // Base colors
    const baseColor = isSelected ? '#22C55E' : isHovered ? '#F59E0B' : marker.color;
    const bgColor = isSelected ? 'rgba(34, 197, 94, 0.2)' : isHovered ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.15)';
    const borderColor = isSelected ? '#22C55E' : isHovered ? '#F59E0B' : '#3B82F6';
    const borderWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5;

    return { size, baseColor, bgColor, borderColor, borderWidth };
  }, [marker.size, marker.isSelected, marker.isHovered, marker.color]);

  // Render different marker shapes based on type
  const renderMarker = () => {
    const { size, baseColor, bgColor, borderColor, borderWidth } = markerStyle;
    const halfSize = size / 2;

    switch (marker.markerType) {
      case 'vertex':
        // Diamond shape for vertices
        return (
          <SvgRect
            x={screenPos.x - halfSize}
            y={screenPos.y - halfSize}
            width={size}
            height={size}
            fill={bgColor}
            stroke={borderColor}
            strokeWidth={borderWidth}
            transform={`rotate(45, ${screenPos.x}, ${screenPos.y})`}
          />
        );

      case 'center':
        // Circle with cross for centers
        return (
          <G>
            <SvgCircle
              cx={screenPos.x}
              cy={screenPos.y}
              r={halfSize}
              fill={bgColor}
              stroke={borderColor}
              strokeWidth={borderWidth}
            />
            {/* Small cross in center */}
            <SvgRect
              x={screenPos.x - 2}
              y={screenPos.y - 6}
              width={4}
              height={12}
              fill={baseColor}
            />
            <SvgRect
              x={screenPos.x - 6}
              y={screenPos.y - 2}
              width={12}
              height={4}
              fill={baseColor}
            />
          </G>
        );

      case 'endpoint':
        // Square for endpoints
        return (
          <SvgRect
            x={screenPos.x - halfSize}
            y={screenPos.y - halfSize}
            width={size}
            height={size}
            fill={bgColor}
            stroke={borderColor}
            strokeWidth={borderWidth}
          />
        );

      case 'midpoint':
        // Small circle for midpoints
        return (
          <SvgCircle
            cx={screenPos.x}
            cy={screenPos.y}
            r={halfSize * 0.8}
            fill={bgColor}
            stroke={borderColor}
            strokeWidth={borderWidth}
          />
        );

      default:
        return null;
    }
  };

  return (
    <G pointerEvents="none">
      {renderMarker()}

      {/* Invisible touch area */}
      <SvgRect
        x={screenPos.x - marker.size / 2 - 8}
        y={screenPos.y - marker.size / 2 - 8}
        width={marker.size + 16}
        height={marker.size + 16}
        fill="transparent"
        onPress={() => onPress?.(marker)}
        onPressIn={() => onHover?.(marker, true)}
        onPressOut={() => onHover?.(marker, false)}
        pointerEvents="auto"
      />
    </G>
  );
};

interface CADPointMarkersProps {
  /** Array of point markers to render */
  markers: PointMarker[];

  /** Current viewport for coordinate transformation */
  viewport: Viewport;

  /** Callback when marker is pressed */
  onMarkerPress?: (marker: PointMarker) => void;

  /** Callback when marker is hovered */
  onMarkerHover?: (marker: PointMarker, isHovered: boolean) => void;
}

/**
 * Renders multiple point markers
 */
export const CADPointMarkers: React.FC<CADPointMarkersProps> = ({
  markers,
  viewport,
  onMarkerPress,
  onMarkerHover,
}) => {
  return (
    <G pointerEvents="auto">
      {markers.map(marker => (
        <CADPointMarker
          key={marker.pointId}
          marker={marker}
          viewport={viewport}
          onPress={onMarkerPress}
          onHover={onMarkerHover}
        />
      ))}
    </G>
  );
};