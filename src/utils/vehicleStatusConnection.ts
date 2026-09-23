import { colors } from "../theme/colors";

/**
 * Pure connection-state derivation for the Robot Status card, kept out of
 * VehicleStatusCard.tsx so it can be unit tested without pulling in
 * react-native/JSX (this project's Jest config cannot parse .tsx modules
 * under src/components -- see NativeMapLayers.test.tsx).
 *
 * `dataStale` only matters while actually connected -- an outright
 * disconnect already has its own (red) state and must not be relabelled
 * "Stale".
 */
export function resolveVehicleConnectionState(
  isConnected: boolean,
  dataStale: boolean,
  socketTransport: "websocket" | "polling" | null,
): {
  stale: boolean;
  connectionColor: string;
  socketLabel: string;
  socketColor: string;
} {
  const stale = isConnected && dataStale;
  const connectionColor = !isConnected
    ? colors.danger
    : stale
      ? colors.warning
      : colors.success;
  const socketLabel = !isConnected
    ? "Down"
    : stale
      ? "Stale"
      : socketTransport === "websocket"
        ? "WebSocket"
        : socketTransport === "polling"
          ? "Polling"
          : "Connecting";
  const socketColor = !isConnected
    ? colors.danger
    : stale
      ? colors.warning
      : socketTransport === "websocket"
        ? colors.success
        : colors.warning;
  return { stale, connectionColor, socketLabel, socketColor };
}
