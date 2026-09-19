import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { Socket } from "socket.io-client";

let mockRoverPosition = { lat: 12, lng: 77, timestamp: 1 };

jest.mock("../../context/TelemetryContext", () => ({
  useTelemetry: () => ({ roverPosition: mockRoverPosition }),
}));
jest.mock("../../config/featureFlags", () => ({ POINT_MISSION_ENABLED: true }));
jest.mock("../../services/missionLifecycleService", () => ({
  getPointEvents: jest.fn(),
  getPointStatus: jest.fn(),
}));

import * as pointAdapter from "../../adapters/pointEventAdapter";
import {
  usePointMissionEvents,
  type UsePointMissionEventsResult,
} from "../usePointMissionEvents";

function createSocket() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    on: jest.fn((name: string, listener: (payload: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    }),
    off: jest.fn((name: string, listener: (payload: unknown) => void) => {
      listeners.get(name)?.delete(listener);
    }),
    emit(name: string, payload: unknown) {
      act(() => listeners.get(name)?.forEach((listener) => listener(payload)));
    },
    listenerCount() {
      return [...listeners.values()].reduce((count, handlers) => count + handlers.size, 0);
    },
  };
}

function renderPointEvents(socket: ReturnType<typeof createSocket>) {
  const result = { current: undefined as unknown as UsePointMissionEventsResult };
  function Probe() {
    result.current = usePointMissionEvents(socket as unknown as Socket, "connected");
    return null;
  }
  let renderer!: ReturnType<typeof TestRenderer.create>;
  act(() => { renderer = TestRenderer.create(React.createElement(Probe)); });
  return {
    result,
    rerender: () => act(() => renderer.update(React.createElement(Probe))),
    unmount: () => act(() => renderer.unmount()),
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mockRoverPosition = { lat: 12, lng: 77, timestamp: 1 };
});

afterEach(() => jest.restoreAllMocks());

it("does not rescan a large mission on telemetry renders and still uses the latest position", () => {
  const waitingScan = jest.spyOn(pointAdapter, "hasWaitingForContinue");
  const indexScan = jest.spyOn(pointAdapter, "getCurrentPointIndex");
  const socket = createSocket();
  const hook = renderPointEvents(socket);

  socket.emit("mission_status", { point_status: Array(10_000).fill("COMPLETED") });
  expect(hook.result.current.currentPointIndex).toBe(9_999);
  const original = hook.result.current;
  waitingScan.mockClear();
  indexScan.mockClear();
  const registrations = socket.on.mock.calls.length;

  for (let i = 0; i < 25; i += 1) {
    mockRoverPosition = { lat: 13 + i, lng: 78 + i, timestamp: 2 + i };
    hook.rerender();
    expect(hook.result.current).toBe(original);
  }
  expect(waitingScan).not.toHaveBeenCalled();
  expect(indexScan).not.toHaveBeenCalled();
  expect(socket.on).toHaveBeenCalledTimes(registrations);

  socket.emit("point_event", { point_index: 10_000, status: "ACTIVE" });
  expect(hook.result.current.currentPointIndex).toBe(10_000);
  expect(hook.result.current.statusMap[10_000]).toMatchObject({
    status: "active",
    lat: mockRoverPosition.lat,
    lon: mockRoverPosition.lng,
  });
  expect(waitingScan).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(socket.listenerCount()).toBe(0);
});

it("updates waiting, continuation, completion and reset state without changing subscriptions", () => {
  const socket = createSocket();
  const hook = renderPointEvents(socket);
  const registrations = socket.on.mock.calls.length;

  socket.emit("point_mission_event", {
    event_id: 1,
    generation: 3,
    event_type: "point_waiting_for_continue",
    point_index: 2,
    timestamp: "2026-09-18T00:00:00.000Z",
  });
  expect(hook.result.current.waitingForContinue).toBe(true);
  expect(hook.result.current.expectedGeneration).toBe(3);
  expect(hook.result.current.lastEventId).toBe(1);

  act(() => hook.result.current.acknowledgeContinueSuccess());
  expect(hook.result.current.waitingForContinue).toBe(false);
  expect(hook.result.current.statusMap[2].status).toBe("completed");

  socket.emit("mission_completed", { active_point_index: 2 });
  expect(hook.result.current.missionTerminal?.outcome).toBe("completed");
  act(() => hook.result.current.clearMissionTerminal());
  expect(hook.result.current.missionTerminal).toBeNull();

  act(() => hook.result.current.resetStatusMap());
  expect(hook.result.current.statusMap).toEqual({});
  expect(hook.result.current.currentPointIndex).toBeNull();
  expect(hook.result.current.lastEventId).toBeNull();
  expect(hook.result.current.expectedGeneration).toBeNull();
  expect(socket.on).toHaveBeenCalledTimes(registrations);
  hook.unmount();
  expect(socket.listenerCount()).toBe(0);
});
