import {
  LIVE_PANEL_PACKET_STALE_MS,
  clearSocketTelemetryPacket,
  isSocketTelemetryStalled,
  markSocketTelemetryPacket,
  socketTelemetryPacketAgeMs,
} from "../socketPacketClock";

describe("socketPacketClock", () => {
  afterEach(() => clearSocketTelemetryPacket());

  test("no packet on this connection is stalled", () => {
    clearSocketTelemetryPacket();
    expect(socketTelemetryPacketAgeMs(1000)).toBeNull();
    expect(isSocketTelemetryStalled(1000)).toBe(true);
  });

  test("a silent socket stalls live panels within the window", () => {
    markSocketTelemetryPacket(10_000);
    expect(isSocketTelemetryStalled(10_000 + LIVE_PANEL_PACKET_STALE_MS)).toBe(false);
    expect(isSocketTelemetryStalled(10_000 + LIVE_PANEL_PACKET_STALE_MS + 1)).toBe(true);
    // Far tighter than TelemetryContext's 2.5 s + 1 s tick socket staleness.
    expect(LIVE_PANEL_PACKET_STALE_MS).toBeLessThan(1000);
  });

  test("disconnect clears the clock so reconnect cannot look live", () => {
    markSocketTelemetryPacket(10_000);
    clearSocketTelemetryPacket();
    expect(isSocketTelemetryStalled(10_001)).toBe(true);
  });
});
