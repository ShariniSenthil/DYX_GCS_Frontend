import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  LiveTelemetryStoreContext,
  createLiveTelemetryStore,
  shallowEqual,
  useLiveTelemetrySelector,
  type LiveTelemetrySnapshot,
} from "../liveTelemetryStore";

function snapshot(
  crossTrackMm: number,
  missionStatus = "RUNNING",
  lat = 12,
): LiveTelemetrySnapshot {
  return {
    connectionState: "connected",
    roverPosition: { lat, lng: 77, timestamp: crossTrackMm },
    telemetry: {
      mission: { status: missionStatus },
      rpp_cross_track_error_mm: crossTrackMm,
      rpp_debug_fresh: true,
      hrms: 0.01 + crossTrackMm / 1e6,
    } as never,
  };
}

const renders = { screen: 0, table: 0, panel: 0 };

// Same slow selector shape as MissionReportScreen.
const selectScreen = (s: LiveTelemetrySnapshot) => ({
  missionStatus: s.telemetry.mission?.status,
});
const selectPanel = (s: LiveTelemetrySnapshot) => ({
  cross: s.telemetry.rpp_cross_track_error_mm,
  fresh: s.telemetry.rpp_debug_fresh,
});

const Table = React.memo(function Table(props: { status: unknown }) {
  renders.table += 1;
  return React.createElement("Text", null, String(props.status));
});

function Panel() {
  renders.panel += 1;
  const rpp = useLiveTelemetrySelector(selectPanel, shallowEqual);
  return React.createElement("Text", null, String(rpp.cross));
}

function Screen() {
  renders.screen += 1;
  const slow = useLiveTelemetrySelector(selectScreen, shallowEqual);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(Table, { status: slow.missionStatus }),
    React.createElement(Panel),
  );
}

describe("live telemetry render isolation", () => {
  beforeEach(() => {
    renders.screen = 0;
    renders.table = 0;
    renders.panel = 0;
  });

  test("cross-track changes re-render only the live panel", () => {
    const store = createLiveTelemetryStore(snapshot(0));
    act(() => {
      TestRenderer.create(
        React.createElement(
          LiveTelemetryStoreContext.Provider,
          { value: store },
          React.createElement(Screen),
        ),
      );
    });
    expect(renders).toEqual({ screen: 1, table: 1, panel: 1 });

    // 100 packets at telemetry rate: cross-track, hrms and position change.
    for (let i = 1; i <= 100; i += 1) {
      act(() => store.publish(snapshot(i, "RUNNING", 12 + i * 1e-7)));
    }
    expect(renders.screen).toBe(1);
    expect(renders.table).toBe(1);
    expect(renders.panel).toBe(101);

    // A lifecycle change does reach the screen and table.
    act(() => store.publish(snapshot(100, "PAUSED")));
    expect(renders.screen).toBe(2);
    expect(renders.table).toBe(2);
  });

  test("identical republish is ignored; unchanged slice keeps identity", () => {
    const first = snapshot(5);
    const store = createLiveTelemetryStore(first);
    const listener = jest.fn();
    store.subscribe(listener);
    store.publish(first);
    expect(listener).not.toHaveBeenCalled();
    store.publish(snapshot(5));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
