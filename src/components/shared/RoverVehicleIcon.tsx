import React from "react";
import { View } from "react-native";
import Svg, { Circle, Ellipse, Line, Rect } from "react-native-svg";

export type RoverVehicleStatus = "armed" | "rtk" | "disarmed" | string;

/** Map marker size. Small enough not to cover nearby points. */
export const ROVER_MAP_ICON_SIZE = 40;

function bodyFill(status: RoverVehicleStatus): string {
  if (status === "armed") return "#22c55e";
  if (status === "rtk") return "#38bdf8";
  return "#f5c518";
}

/**
 * Compact top-down 4WD rover. -Y is forward so map heading rotation is correct.
 */
export function RoverVehicleIcon({
  heading,
  status = "disarmed",
  size = ROVER_MAP_ICON_SIZE,
}: {
  heading: number | null | undefined;
  status?: RoverVehicleStatus;
  size?: number;
}): React.ReactElement {
  const rotationDeg =
    typeof heading === "number" && Number.isFinite(heading) ? heading : 0;
  const fill = bodyFill(status);

  return (
    <View
      collapsable={false}
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        backgroundColor: "transparent",
        overflow: "visible",
        transform: [{ rotate: `${rotationDeg}deg` }],
      }}
    >
      <Svg
        width={size}
        height={size}
        viewBox="-16 -16 32 32"
        style={{ backgroundColor: "transparent" }}
      >
        <Ellipse cx={-10.4} cy={-7.1} rx={3.15} ry={5.15} fill="#0f172a" />
        <Ellipse cx={10.4} cy={-7.1} rx={3.15} ry={5.15} fill="#0f172a" />
        <Ellipse cx={-10.4} cy={7.1} rx={3.15} ry={5.15} fill="#0f172a" />
        <Ellipse cx={10.4} cy={7.1} rx={3.15} ry={5.15} fill="#0f172a" />

        <Ellipse cx={-10.4} cy={-7.1} rx={1.55} ry={2.7} fill="#64748b" />
        <Ellipse cx={10.4} cy={-7.1} rx={1.55} ry={2.7} fill="#64748b" />
        <Ellipse cx={-10.4} cy={7.1} rx={1.55} ry={2.7} fill="#64748b" />
        <Ellipse cx={10.4} cy={7.1} rx={1.55} ry={2.7} fill="#64748b" />

        <Line x1={-10.4} y1={-10.4} x2={-10.4} y2={-3.8} stroke="#94a3b8" strokeWidth={0.45} />
        <Line x1={10.4} y1={-10.4} x2={10.4} y2={-3.8} stroke="#94a3b8" strokeWidth={0.45} />
        <Line x1={-10.4} y1={3.8} x2={-10.4} y2={10.4} stroke="#94a3b8" strokeWidth={0.45} />
        <Line x1={10.4} y1={3.8} x2={10.4} y2={10.4} stroke="#94a3b8" strokeWidth={0.45} />

        <Rect
          x={-6.6}
          y={-8.4}
          width={13.2}
          height={16.8}
          rx={2.6}
          fill={fill}
          stroke="#ffffff"
          strokeWidth={1.15}
        />
        <Rect x={-5.4} y={-8.4} width={10.8} height={3.4} rx={1.2} fill="#334155" />
        <Rect x={-4.6} y={-4.6} width={9.2} height={5.4} rx={1.1} fill="rgba(15,23,42,0.2)" />
        <Rect x={-3.3} y={2.2} width={6.6} height={4.4} rx={1} fill="#0f172a" />

        <Rect x={-3.6} y={-7.5} width={2.5} height={1.35} rx={0.45} fill="#67e8f9" />
        <Rect x={1.1} y={-7.5} width={2.5} height={1.35} rx={0.45} fill="#67e8f9" />
        <Circle cx={0} cy={8.2} r={1.05} fill="#94a3b8" stroke="#fff" strokeWidth={0.45} />
      </Svg>
    </View>
  );
}

export function roverVehicleSvgMarkup(
  rotation: number,
  fill = "#f5c518",
  size = ROVER_MAP_ICON_SIZE,
): string {
  return `
    <svg width="${size}" height="${size}" viewBox="-16 -16 32 32" xmlns="http://www.w3.org/2000/svg" style="background: transparent; transform: rotate(${rotation}deg); will-change: transform;">
      <ellipse cx="-10.4" cy="-7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
      <ellipse cx="10.4" cy="-7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
      <ellipse cx="-10.4" cy="7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
      <ellipse cx="10.4" cy="7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
      <ellipse cx="-10.4" cy="-7.1" rx="1.55" ry="2.7" fill="#64748b"/>
      <ellipse cx="10.4" cy="-7.1" rx="1.55" ry="2.7" fill="#64748b"/>
      <ellipse cx="-10.4" cy="7.1" rx="1.55" ry="2.7" fill="#64748b"/>
      <ellipse cx="10.4" cy="7.1" rx="1.55" ry="2.7" fill="#64748b"/>
      <rect x="-6.6" y="-8.4" width="13.2" height="16.8" rx="2.6" fill="${fill}" stroke="#ffffff" stroke-width="1.15"/>
      <rect x="-5.4" y="-8.4" width="10.8" height="3.4" rx="1.2" fill="#334155"/>
      <rect x="-4.6" y="-4.6" width="9.2" height="5.4" rx="1.1" fill="rgba(15,23,42,0.2)"/>
      <rect x="-3.3" y="2.2" width="6.6" height="4.4" rx="1" fill="#0f172a"/>
      <rect x="-3.6" y="-7.5" width="2.5" height="1.35" rx="0.45" fill="#67e8f9"/>
      <rect x="1.1" y="-7.5" width="2.5" height="1.35" rx="0.45" fill="#67e8f9"/>
      <circle cx="0" cy="8.2" r="1.05" fill="#94a3b8" stroke="#fff" stroke-width="0.45"/>
    </svg>
  `.trim();
}

export default RoverVehicleIcon;
