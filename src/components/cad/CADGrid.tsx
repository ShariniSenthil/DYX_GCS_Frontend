// ============================================================
// CADGrid — AutoCAD-style adaptive dot grid rendered with SVG
// ============================================================

import React, { useMemo, memo } from 'react';
import { G, Circle, Line } from 'react-native-svg';
import { Viewport, CanvasSize } from '../../core/cad';
import { worldToScreen, screenToWorld } from '../../core/cad';

interface CADGridProps {
  viewport: Viewport;
  canvasSize: CanvasSize;
  spacing: number;
  majorEveryN: number;
  showAxes: boolean;
}

function viewportEqual(a: Viewport, b: Viewport): boolean {
  return a.scale === b.scale && a.offsetX === b.offsetX && a.offsetY === b.offsetY;
}

function CADGridImpl({ viewport, canvasSize, spacing, majorEveryN, showAxes }: CADGridProps) {
  const { dots, majorDots, originScreen } = useMemo(() => {
    // Adaptive spacing: keep dots readable at any zoom
    let effectiveSpacing = spacing;
    const minPixelSpacing = 10;
    let pixelSpacing = effectiveSpacing * viewport.scale;

    while (pixelSpacing < minPixelSpacing && effectiveSpacing < 1e12) {
      effectiveSpacing *= 10;
      pixelSpacing = effectiveSpacing * viewport.scale;
    }
    while (pixelSpacing > 160 && effectiveSpacing > 1e-12) {
      effectiveSpacing /= 10;
      pixelSpacing = effectiveSpacing * viewport.scale;
    }

    const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
    const bottomRight = screenToWorld({ x: canvasSize.width, y: canvasSize.height }, viewport);

    const minX = Math.floor(topLeft.x / effectiveSpacing) * effectiveSpacing;
    const maxX = Math.ceil(bottomRight.x / effectiveSpacing) * effectiveSpacing;
    const minY = Math.floor(bottomRight.y / effectiveSpacing) * effectiveSpacing;
    const maxY = Math.ceil(topLeft.y / effectiveSpacing) * effectiveSpacing;

    // Cap total dots so pan/zoom stays responsive
    const maxDots = 900;
    const stepsX = Math.max(1, Math.ceil((maxX - minX) / effectiveSpacing));
    const stepsY = Math.max(1, Math.ceil((maxY - minY) / effectiveSpacing));
    const total = (stepsX + 1) * (stepsY + 1);
    const stride = total > maxDots ? Math.ceil(Math.sqrt(total / maxDots)) : 1;

    const dots: { cx: number; cy: number }[] = [];
    const majorDots: { cx: number; cy: number }[] = [];
    const pad = 10;

    for (let i = 0; i <= stepsX; i += stride) {
      const wx = minX + i * effectiveSpacing;
      for (let j = 0; j <= stepsY; j += stride) {
        const wy = minY + j * effectiveSpacing;
        const sp = worldToScreen({ x: wx, y: wy }, viewport);
        if (sp.x < -pad || sp.x > canvasSize.width + pad) continue;
        if (sp.y < -pad || sp.y > canvasSize.height + pad) continue;

        const gridI = Math.round(wx / effectiveSpacing);
        const gridJ = Math.round(wy / effectiveSpacing);
        if (gridI % majorEveryN === 0 && gridJ % majorEveryN === 0) {
          majorDots.push({ cx: sp.x, cy: sp.y });
        } else {
          dots.push({ cx: sp.x, cy: sp.y });
        }
      }
    }

    return {
      dots,
      majorDots,
      originScreen: worldToScreen({ x: 0, y: 0 }, viewport),
    };
  }, [viewport.scale, viewport.offsetX, viewport.offsetY, canvasSize.width, canvasSize.height, spacing, majorEveryN]);

  return (
    <G pointerEvents="none">
      {dots.map((d, i) => (
        <Circle key={`d-${i}`} cx={d.cx} cy={d.cy} r={0.8} fill="#6B7280" opacity={0.4} />
      ))}
      {majorDots.map((d, i) => (
        <Circle key={`m-${i}`} cx={d.cx} cy={d.cy} r={1.2} fill="#9CA3AF" opacity={0.6} />
      ))}

      {showAxes && originScreen.x >= 0 && originScreen.x <= canvasSize.width && (
        <Line x1={0} y1={originScreen.y} x2={canvasSize.width} y2={originScreen.y} stroke="#3B82F6" strokeWidth={0.5} opacity={0.4} />
      )}
      {showAxes && originScreen.y >= 0 && originScreen.y <= canvasSize.height && (
        <Line x1={originScreen.x} y1={0} x2={originScreen.x} y2={canvasSize.height} stroke="#3B82F6" strokeWidth={0.5} opacity={0.4} />
      )}
    </G>
  );
}

export const CADGrid = memo(CADGridImpl, (prev, next) => (
  viewportEqual(prev.viewport, next.viewport)
  && prev.canvasSize.width === next.canvasSize.width
  && prev.canvasSize.height === next.canvasSize.height
  && prev.spacing === next.spacing
  && prev.majorEveryN === next.majorEveryN
  && prev.showAxes === next.showAxes
));
