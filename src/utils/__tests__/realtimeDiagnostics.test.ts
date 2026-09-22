import {
  __configureRealtimeDiagnosticsForTest,
  countRender,
  countSocketPacket,
  flushRealtimeDiagnostics,
  markPointEventReceived,
  markPointRowDisplayed,
  type RealtimeDiagnosticsSummary,
} from "../realtimeDiagnostics";

describe("realtimeDiagnostics", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    __configureRealtimeDiagnosticsForTest({ enabled: false });
    jest.useRealTimers();
  });

  test("disabled: no-op", () => {
    const sink = jest.fn();
    __configureRealtimeDiagnosticsForTest({ enabled: false, sink });
    countSocketPacket("telemetry");
    countRender("X");
    expect(flushRealtimeDiagnostics()).toBeNull();
    jest.advanceTimersByTime(5000);
    expect(sink).not.toHaveBeenCalled();
  });

  test("enabled: one summary per second with rates and row latency", () => {
    const summaries: RealtimeDiagnosticsSummary[] = [];
    __configureRealtimeDiagnosticsForTest({
      enabled: true,
      sink: (s) => summaries.push(s),
    });
    for (let i = 0; i < 20; i += 1) countSocketPacket("telemetry");
    countRender("MissionReportScreen");
    markPointEventReceived("run-1:P0025");
    jest.advanceTimersByTime(120);
    markPointRowDisplayed("run-1:P0025");
    jest.advanceTimersByTime(880);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].packetsPerSec.telemetry).toBe(20);
    expect(summaries[0].rendersPerSec.MissionReportScreen).toBe(1);
    expect(summaries[0].pointRowLatencyMs).toEqual({
      count: 1,
      max: 120,
      median: 120,
    });
  });
});
