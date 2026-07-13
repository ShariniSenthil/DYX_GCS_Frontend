// ============================================================
// CADEntityRenderer — SVG renderer for all CAD entity types
// ============================================================
//
// Converts world-coordinate entities to SVG primitives using
// the current viewport. Renders true arcs, circles, and lines.

import React, { memo } from 'react';
import { G, Line, Path, Circle, Text as SvgText, Rect, Polyline } from 'react-native-svg';
import { CADEntity, Viewport, CADLayer } from '../../core/cad';
import { worldToScreen, worldToScreenLength } from '../../core/cad';

interface CADEntityRendererProps {
  entity: CADEntity;
  viewport: Viewport;
  layers: CADLayer[];
  isSelected: boolean;
}

function viewportEqual(a: Viewport, b: Viewport): boolean {
  return a.scale === b.scale && a.offsetX === b.offsetX && a.offsetY === b.offsetY;
}

export const CADEntityRenderer: React.FC<CADEntityRendererProps> = memo(({
  entity, viewport, layers, isSelected,
}) => {
  const layer = layers.find(l => l.name === entity.layer);
  const color = layer?.color ?? '#22C55E';
  const stroke = isSelected ? '#F59E0B' : color;
  const strokeWidth = isSelected ? 2 : 1.5;

  if (layer && !layer.visible) return null;

  switch (entity.type) {
    case 'Line': {
      const s1 = worldToScreen(entity.start, viewport);
      const s2 = worldToScreen(entity.end, viewport);
      return (
        <G key={entity.id}>
          <Line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={stroke} strokeWidth={strokeWidth} />
          {isSelected && (
            <>
              <Circle cx={s1.x} cy={s1.y} r={3} fill="none" stroke="#F59E0B" strokeWidth={1.5} />
              <Circle cx={s2.x} cy={s2.y} r={3} fill="none" stroke="#F59E0B" strokeWidth={1.5} />
            </>
          )}
        </G>
      );
    }

    case 'Circle': {
      const sc = worldToScreen(entity.center, viewport);
      const sr = worldToScreenLength(entity.radius, viewport);
      return (
        <G key={entity.id}>
          <Circle cx={sc.x} cy={sc.y} r={sr} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
          {isSelected && (
            <>
              <Circle cx={sc.x} cy={sc.y} r={3} fill="#F59E0B" />
              <Circle cx={sc.x + sr} cy={sc.y} r={3} fill="none" stroke="#F59E0B" strokeWidth={1.5} />
              <Circle cx={sc.x - sr} cy={sc.y} r={3} fill="none" stroke="#F59E0B" strokeWidth={1.5} />
            </>
          )}
        </G>
      );
    }

    case 'Arc': {
      const sc = worldToScreen(entity.center, viewport);
      const sr = worldToScreenLength(entity.radius, viewport);
      const d = arcToSvgPath(sc.x, sc.y, sr, entity.startAngle, entity.endAngle);
      return (
        <G key={entity.id}>
          <Path d={d} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
        </G>
      );
    }

    case 'Rectangle': {
      const s1 = worldToScreen(entity.corner1, viewport);
      const s2 = worldToScreen(entity.corner2, viewport);
      const x = Math.min(s1.x, s2.x);
      const y = Math.min(s1.y, s2.y);
      const w = Math.abs(s2.x - s1.x);
      const h = Math.abs(s2.y - s1.y);
      return (
        <G key={entity.id}>
          <Rect x={x} y={y} width={w} height={h} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
        </G>
      );
    }

    case 'Polyline': {
      const pts = entity.vertices.map(v => worldToScreen(v, viewport));
      const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
      return (
        <G key={entity.id}>
          <Polyline points={pointsStr} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
        </G>
      );
    }

    case 'Point': {
      const sp = worldToScreen(entity.position, viewport);
      return (
        <G key={entity.id}>
          <Circle cx={sp.x} cy={sp.y} r={3} fill={color} />
        </G>
      );
    }

    case 'Text': {
      const sp = worldToScreen(entity.position, viewport);
      const fontSize = worldToScreenLength(entity.height, viewport);
      return (
        <G key={entity.id}>
          <SvgText x={sp.x} y={sp.y} fontSize={Math.max(8, fontSize)} fill={color} rotation={-(entity.rotation * 180 / Math.PI)} origin={`${sp.x},${sp.y}`} fontWeight="600">
            {entity.content}
          </SvgText>
        </G>
      );
    }

    case 'Dimension': {
      const s1 = worldToScreen(entity.p1, viewport);
      const s2 = worldToScreen(entity.p2, viewport);
      const midX = (s1.x + s2.x) / 2;
      const midY = (s1.y + s2.y) / 2;
      return (
        <G key={entity.id}>
          <Line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={stroke} strokeWidth={1} strokeDasharray="4,2" />
          <SvgText x={midX} y={midY - 5} fontSize={10} fill={color} textAnchor="middle" fontWeight="600">
            {entity.text}
          </SvgText>
        </G>
      );
    }

    default:
      return null;
  }
}, (prev, next) => (
  prev.entity === next.entity
  && prev.layers === next.layers
  && prev.isSelected === next.isSelected
  && viewportEqual(prev.viewport, next.viewport)
));

// ============================================================
// SVG Arc Path Generator
// ============================================================

/**
 * Generate an SVG path string for an arc.
 * Arcs in our model are stored with angles in radians (math convention, CCW from +X).
 * SVG screen space has Y going down, so we need to negate angles.
 */
function arcToSvgPath(
  cx: number, cy: number, r: number,
  startAngleRad: number, endAngleRad: number,
): string {
  // Convert math angles to screen angles (flip Y)
  const startScreenAngle = -startAngleRad;
  const endScreenAngle = -endAngleRad;

  const startX = cx + r * Math.cos(startScreenAngle);
  const startY = cy + r * Math.sin(startScreenAngle);
  const endX = cx + r * Math.cos(endScreenAngle);
  const endY = cy + r * Math.sin(endScreenAngle);

  // Determine sweep direction
  let sweep = endAngleRad - startAngleRad;
  // Normalize to [-2PI, 2PI]
  while (sweep > 2 * Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -2 * Math.PI) sweep += 2 * Math.PI;

  const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
  // In screen space (Y-down), CCW math becomes CW screen, so sweep-flag = 0
  const sweepFlag = sweep >= 0 ? 0 : 1;

  return `M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} ${sweepFlag} ${endX.toFixed(2)} ${endY.toFixed(2)}`;
}
