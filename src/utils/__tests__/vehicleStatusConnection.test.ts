import { resolveVehicleConnectionState } from "../vehicleStatusConnection";
import { colors } from "../../theme/colors";

describe("resolveVehicleConnectionState", () => {
  test("connected and fresh is LIVE (green), not stale", () => {
    const result = resolveVehicleConnectionState(true, false, "websocket");
    expect(result.stale).toBe(false);
    expect(result.connectionColor).toBe(colors.success);
    expect(result.socketLabel).toBe("WebSocket");
    expect(result.socketColor).toBe(colors.success);
  });

  test("socket connected but telemetry packets have stopped: STALE, not LIVE", () => {
    const result = resolveVehicleConnectionState(true, true, "websocket");
    expect(result.stale).toBe(true);
    expect(result.connectionColor).toBe(colors.warning);
    expect(result.socketLabel).toBe("Stale");
    expect(result.socketColor).toBe(colors.warning);
  });

  test("an outright disconnect is DOWN (red), never relabelled Stale", () => {
    // dataStale=true must not matter once the socket itself is down --
    // disconnect has its own, more severe, state.
    const result = resolveVehicleConnectionState(false, true, "websocket");
    expect(result.stale).toBe(false);
    expect(result.connectionColor).toBe(colors.danger);
    expect(result.socketLabel).toBe("Down");
    expect(result.socketColor).toBe(colors.danger);
  });

  test("connected via polling and fresh is not marked stale", () => {
    const result = resolveVehicleConnectionState(true, false, "polling");
    expect(result.stale).toBe(false);
    expect(result.socketLabel).toBe("Polling");
    expect(result.socketColor).toBe(colors.warning);
  });
});
