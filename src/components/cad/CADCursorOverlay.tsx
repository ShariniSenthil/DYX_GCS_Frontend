// ============================================================
// CADCursorOverlay — AutoSnap marker + magnet crosshair
// ============================================================
//
// When a snap is active, the crosshair and glyph lock to the snap
// screen position (AutoCAD AutoSnap magnet), not the finger.

import React, { memo } from 'react';
import { G, Line, Circle, Rect, Polygon } from 'react-native-svg';
import { ScreenPoint, SnapResult } from '../../core/cad';

interface CADCursorOverlayProps {
  /** Raw finger position (screen px) */
  cursorScreen: ScreenPoint | null;
  /** Active object/grid snap, if any */
  snapResult: SnapResult | null;
  /** Screen position of snapResult.point (magnet target) */
  snapScreen: ScreenPoint | null;
  canvasWidth: number;
  canvasHeight: number;
  isDrawing: boolean;
}

export const CADCursorOverlay: React.FC<CADCursorOverlayProps> = memo(({
  cursorScreen, snapResult, snapScreen, canvasWidth, canvasHeight, isDrawing,
}) => {
  if (!cursorScreen) return null;

  // Magnet: lock display to snap point when engaged
  const locked = snapResult != null && snapScreen != null;
  const x = locked ? snapScreen!.x : cursorScreen.x;
  const y = locked ? snapScreen!.y : cursorScreen.y;

  const crossColor = locked ? '#FBBF24' : isDrawing ? '#22C55E' : '#9CA3AF';
  const centerColor = locked ? '#FBBF24' : isDrawing ? '#22C55E' : '#FFFFFF';

  return (
    <G pointerEvents="none">
      {/* Full-canvas crosshair */}
      <Line x1={0} y1={y} x2={canvasWidth} y2={y} stroke={crossColor} strokeWidth={0.5} opacity={locked ? 0.7 : 0.45} />
      <Line x1={x} y1={0} x2={x} y2={canvasHeight} stroke={crossColor} strokeWidth={0.5} opacity={locked ? 0.7 : 0.45} />

      {/* Center crosshair */}
      <Line x1={x - 10} y1={y} x2={x + 10} y2={y} stroke={centerColor} strokeWidth={locked ? 2 : 1.5} />
      <Line x1={x} y1={y - 10} x2={x} y2={y + 10} stroke={centerColor} strokeWidth={locked ? 2 : 1.5} />

      {/* AutoSnap glow + mode glyph at snap point */}
      {locked && snapResult && (
        <G>
          {/* Outer glow rings */}
          <Circle cx={x} cy={y} r={16} fill="#FBBF24" opacity={0.12} />
          <Circle cx={x} cy={y} r={11} fill="#FBBF24" opacity={0.2} />
          <Circle cx={x} cy={y} r={7} fill="none" stroke="#FBBF24" strokeWidth={1.5} opacity={0.85} />
          <SnapGlyph x={x} y={y} mode={snapResult.mode} color="#FDE68A" />
        </G>
      )}
    </G>
  );
});

/** AutoCAD-style snap glyph for each snap mode */
const SnapGlyph: React.FC<{ x: number; y: number; mode: string; color: string }> = ({ x, y, mode, color }) => {
  switch (mode) {
    case 'endpoint':
      return <Rect x={x - 5} y={y - 5} width={10} height={10} fill="none" stroke={color} strokeWidth={2} />;
    case 'midpoint':
      return <Polygon points={`${x},${y - 6} ${x + 6},${y + 5} ${x - 6},${y + 5}`} fill="none" stroke={color} strokeWidth={2} />;
    case 'center':
      return <Circle cx={x} cy={y} r={5} fill="none" stroke={color} strokeWidth={2} />;
    case 'intersection':
      return (
        <G>
          <Line x1={x - 6} y1={y - 6} x2={x + 6} y2={y + 6} stroke={color} strokeWidth={2} />
          <Line x1={x - 6} y1={y + 6} x2={x + 6} y2={y - 6} stroke={color} strokeWidth={2} />
        </G>
      );
    case 'quadrant':
      return <Circle cx={x} cy={y} r={4} fill="none" stroke={color} strokeWidth={1.5} />;
    case 'perpendicular':
      return (
        <G>
          <Line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={color} strokeWidth={2} />
          <Line x1={x} y1={y} x2={x} y2={y + 5} stroke={color} strokeWidth={2} />
          <Line x1={x - 5} y1={y + 5} x2={x + 5} y2={y + 5} stroke={color} strokeWidth={2} />
        </G>
      );
    case 'nearest':
      return <Line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={color} strokeWidth={2} />;
    case 'node':
      return <Circle cx={x} cy={y} r={4} fill={color} />;
    case 'grid':
      return (
        <G>
          <Line x1={x - 4} y1={y} x2={x + 4} y2={y} stroke={color} strokeWidth={1.5} />
          <Line x1={x} y1={y - 4} x2={x} y2={y + 4} stroke={color} strokeWidth={1.5} />
          <Circle cx={x} cy={y} r={2.5} fill={color} />
        </G>
      );
    default:
      return null;
  }
};
