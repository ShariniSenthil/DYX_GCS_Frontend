// ============================================================
// CADUCSIcon — shows world coordinate axes at origin
// ============================================================

import React, { memo } from 'react';
import { G, Line, Path, Text, Rect } from 'react-native-svg';
import { Viewport, CanvasSize } from '../../core/cad';
import { worldToScreen } from '../../core/cad';

interface CADUCSIconProps {
  viewport: Viewport;
  canvasSize: CanvasSize;
}

function viewportEqual(a: Viewport, b: Viewport): boolean {
  return a.scale === b.scale && a.offsetX === b.offsetX && a.offsetY === b.offsetY;
}

export const CADUCSIcon: React.FC<CADUCSIconProps> = memo(({ viewport }) => {
  const origin = worldToScreen({ x: 0, y: 0 }, viewport);

  // Only show if origin is reasonably on-screen
  if (origin.x < -50 || origin.x > 10000 || origin.y < -50 || origin.y > 10000) {
    // Fallback: show at top-left corner
  }

  const size = 30;
  const x1 = origin.x;
  const y1 = origin.y;
  const x2 = origin.x + size;
  const y2 = origin.y;

  // Y axis goes UP in world, which means UP in screen is -Y direction
  const x3 = origin.x;
  const y3 = origin.y - size;

  return (
    <G pointerEvents="none">
      {/* X axis (horizontal, blue) */}
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3B82F6" strokeWidth={1.5} />
      <Path d={`M ${x2} ${y2} L ${x2 - 5} ${y2 - 3} L ${x2 - 5} ${y2 + 3} Z`} fill="#3B82F6" />
      <Text x={x2 + 2} y={y2 + 4} fontSize={10} fill="#3B82F6" fontWeight="700">X</Text>

      {/* Y axis (vertical, green) */}
      <Line x1={x1} y1={y1} x2={x3} y2={y3} stroke="#22C55E" strokeWidth={1.5} />
      <Path d={`M ${x3} ${y3} L ${x3 - 3} ${y3 + 5} L ${x3 + 3} ${y3 + 5} Z`} fill="#22C55E" />
      <Text x={x3 + 4} y={y3 + 2} fontSize={10} fill="#22C55E" fontWeight="700">Y</Text>

      {/* Origin square (WCS marker) */}
      <Rect x={x1 - 3} y={y1 - 3} width={6} height={6} fill="none" stroke="#9CA3AF" strokeWidth={1} />
    </G>
  );
}, (prev, next) => viewportEqual(prev.viewport, next.viewport));
