import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("../../hooks/useRoverTelemetry", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("../../hooks/usePointMissionEvents", () => ({
  usePointMissionEvents: jest.fn(() => null),
}));

import useRoverTelemetry from "../../hooks/useRoverTelemetry";
import {
  TelemetryProvider,
  useTelemetry,
  type MissionLifecycleSlice,
  type TelemetryContextValue,
} from "../TelemetryContext";

const mockUseRoverTelemetry = useRoverTelemetry as jest.MockedFunction<typeof useRoverTelemetry>;
let rover: ReturnType<typeof useRoverTelemetry>;
let renderer: ReturnType<typeof TestRenderer.create> | undefined;

function renderTelemetry() {
  const result = { current: undefined as unknown as TelemetryContextValue };
  const rendered = jest.fn();
  function Probe() {
    result.current = useTelemetry();
    rendered();
    return null;
  }
  const child = React.createElement(Probe);
  const tree = () => React.createElement(TelemetryProvider, null, child);
  act(() => { renderer = TestRenderer.create(tree()); });
  return {
    result,
    rendered,
    rerender: () => act(() => renderer!.update(tree())),
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-18T00:00:00.000Z"));
  rover = {
    connectionState: "connected",
    socketTransport: "websocket",
    telemetry: { lastMessageTs: Date.now() },
    roverPosition: { lat: 12, lng: 77, timestamp: Date.now() },
    reconnect: jest.fn(),
    services: {},
    onMissionEvent: jest.fn(),
    socket: null,
    hasLiveTelemetry: true,
  } as unknown as ReturnType<typeof useRoverTelemetry>;
  mockUseRoverTelemetry.mockImplementation(() => rover);
});

afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
  jest.useRealTimers();
  jest.clearAllMocks();
});

it("does not broadcast repeated lifecycle snapshots to telemetry consumers", () => {
  const hook = renderTelemetry();
  const slice: MissionLifecycleSlice = {
    state: "RUNNING",
    state_lower: "running",
    start_stage: null,
    start_failed_stage: null,
    resume_stage: null,
  };
  act(() => hook.result.current.setMissionLifecycle(slice));
  const original = hook.result.current;
  const renders = hook.rendered.mock.calls.length;

  for (let i = 0; i < 25; i += 1) {
    act(() => hook.result.current.setMissionLifecycle({ ...slice }));
  }
  expect(hook.result.current).toBe(original);
  expect(hook.rendered).toHaveBeenCalledTimes(renders);
});

it.each<keyof MissionLifecycleSlice>([
  "state", "state_lower", "start_stage", "start_failed_stage", "resume_stage",
])("immediately publishes a changed %s field", (field) => {
  const hook = renderTelemetry();
  const setter = hook.result.current.setMissionLifecycle;
  const before = hook.result.current;
  act(() => setter({ [field]: "changed" }));
  expect(hook.result.current).not.toBe(before);
  expect(hook.result.current.missionLifecycle[field]).toBe("changed");
  expect(hook.result.current.setMissionLifecycle).toBe(setter);
});

it("retains staleness updates, GPS abort delivery and disconnected state clearing", () => {
  const hook = renderTelemetry();
  act(() => hook.result.current.setMissionLifecycle({ state: "RUNNING" }));
  act(() => jest.advanceTimersByTime(3_000));
  expect(hook.result.current.telemetry.stale).toBe(true);
  expect(hook.result.current.telemetry.ageMs).toBe(3_000);

  act(() => hook.result.current.reportGpsSafetyAbort("GPS unavailable"));
  expect(hook.result.current.gpsFailsafeStatus).toMatchObject({
    triggered: true,
    reason: "GPS unavailable",
    requires_ack: true,
    action: "abort",
  });

  rover = { ...rover, connectionState: "disconnected" };
  hook.rerender();
  expect(hook.result.current.missionLifecycle).toEqual({});
  expect(hook.result.current.gpsFailsafeStatus).toBeNull();
  expect(hook.result.current.roverPosition).toBeNull();
  expect(hook.result.current.telemetry.state.system_status).toBe("DISCONNECTED");

  act(() => renderer!.unmount());
  renderer = undefined;
  expect(jest.getTimerCount()).toBe(0);
});
