import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  EMPTY_TRAJECTORY_PREVIEW,
  type TrajectoryPreviewState,
} from "../../../utils/backendTrajectoryPreview";

const mockSerializeShape = jest.fn((id: string, shape: unknown) => JSON.stringify(shape));
const mockTelemetryContext = React.createContext({
  telemetry: { attitude: { yaw_deg: 0 }, state: { armed: false }, rtk: { fix_type: 5 } },
  roverPosition: { lat: 13.1, lng: 80.2 },
});
let mockPreview: TrajectoryPreviewState;
let mockSnapshot: {
  waypoints: Array<{ sn: number; lat: number; lon: number }>;
  statusMap: Record<number, { status: string }>;
  activeWaypointIndex: number;
};
const mockSetSharedCamera = jest.fn();

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  StyleSheet: { create: (styles: unknown) => styles, absoluteFillObject: {} },
}));
jest.mock("@rnmapbox/maps", () => ({
  MapView: "MapView",
  Camera: "Camera",
  MarkerView: "MarkerView",
  LineLayer: "LineLayer",
  CircleLayer: "CircleLayer",
  ShapeSource: (props: any) => {
    // Match the installed Mapbox ShapeSource's serialization on each render.
    mockSerializeShape(props.id, props.shape);
    return React.createElement("ShapeSource", props, props.children);
  },
}));
jest.mock("../../../context/BackendTrajectoryContext", () => ({
  useBackendTrajectory: () => ({ preview: mockPreview }),
}));
jest.mock("../../../context/TelemetryContext", () => ({
  useTelemetry: () => React.useContext(mockTelemetryContext),
}));
jest.mock("../../../context/FieldMapContext", () => ({
  useFieldMap: () => ({
    activeSurface: "mission",
    marking: mockSnapshot,
    mission: mockSnapshot,
    markingPressRef: { current: null },
    sharedCamera: null,
    setSharedCamera: mockSetSharedCamera,
  }),
}));
jest.mock("../../../hooks/useMapboxSurface", () => ({
  useMapboxSurface: () => ({ canMount: true, mapReady: false, usingFallback: false }),
}));
jest.mock("../../../config/mapboxConfig", () => ({
  MAPBOX_FALLBACK_STYLE_JSON: "{}",
  mapboxStyleUrlForMode: (mode: string) => mode,
}));
jest.mock("../RoverVehicleIcon", () => ({ RoverVehicleIcon: () => null }));
jest.mock("../MapBottomControlsBar", () => ({ MapBottomControlsBar: () => null }));
jest.mock("../TrajectoryStatusBanner", () => ({ TrajectoryStatusBanner: () => null }));

import { FieldMapHost } from "../FieldMapHost";
import { NativeTrajectoryLayer, NativeWaypointLayer } from "../NativeMapLayers";

let renderer: ReturnType<typeof TestRenderer.create> | undefined;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
beforeEach(() => {
  jest.useFakeTimers();
  mockSerializeShape.mockClear();
  mockPreview = {
    ...EMPTY_TRAJECTORY_PREVIEW,
    phase: "ready",
    points: Array.from({ length: 1500 }, (_, i) => ({
      latitude: 13.1 + i * 0.00001,
      longitude: 80.2 + i * 0.00001,
    })),
  };
  mockSnapshot = {
    waypoints: Array.from({ length: 2500 }, (_, i) => ({
      sn: i + 1,
      lat: 13.1 + i * 0.00001,
      lon: 80.2 + i * 0.00001,
    })),
    statusMap: {},
    activeWaypointIndex: 0,
  };
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  jest.useRealTimers();
});

function fieldMap(tick: number) {
  return (
    <mockTelemetryContext.Provider value={{
      telemetry: { attitude: { yaw_deg: tick }, state: { armed: false }, rtk: { fix_type: 5 } },
      roverPosition: { lat: 13.1 + tick * 0.00001, lng: 80.2 },
    }}>
      <FieldMapHost />
    </mockTelemetryContext.Provider>
  );
}

test("rover telemetry and preview metadata do not reserialize unchanged mission geometry", () => {
  act(() => { renderer = TestRenderer.create(fieldMap(0)); });
  expect(mockSerializeShape.mock.calls.map(([id]) => id)).toEqual(["field-trajectory", "field-points"]);

  for (let tick = 1; tick <= 20; tick += 1) {
    mockPreview = { ...mockPreview, message: `Status ${tick}`, navigationPointCount: tick };
    act(() => { renderer!.update(fieldMap(tick)); });
    act(() => { jest.advanceTimersByTime(50); });
  }
  act(() => { jest.advanceTimersByTime(200); });

  expect(mockSerializeShape).toHaveBeenCalledTimes(2);
  const marker = renderer!.root.findByType("MarkerView");
  expect(marker.props.coordinate).toEqual([80.2, 13.1 + 20 * 0.00001]);

  mockSnapshot = { ...mockSnapshot, statusMap: { 1: { status: "completed" } }, activeWaypointIndex: 1 };
  act(() => { renderer!.update(fieldMap(21)); });
  expect(mockSerializeShape).toHaveBeenCalledTimes(3);
  expect(mockSerializeShape.mock.calls[2][0]).toBe("field-points");
  const waypointShape = mockSerializeShape.mock.calls[2][1] as any;
  expect(waypointShape.features[0].properties.completed).toBe(1);
  expect(waypointShape.features[1].properties.active).toBe(1);

  mockPreview = { ...mockPreview, points: [...mockPreview.points, { latitude: 13.2, longitude: 80.3 }] };
  act(() => { renderer!.update(fieldMap(22)); });
  expect(mockSerializeShape).toHaveBeenCalledTimes(4);
  expect(mockSerializeShape.mock.calls[3][0]).toBe("field-trajectory");

  mockPreview = { ...mockPreview, phase: "idle" };
  act(() => { renderer!.update(fieldMap(23)); });
  expect(renderer!.root.findAllByType("ShapeSource").map((node: any) => node.props.id)).toEqual(["field-points"]);
});

test("authoring layers retain their source options and visual styles", () => {
  const shape = { type: "FeatureCollection" as const, features: [] };
  act(() => {
    renderer = TestRenderer.create(<>
      <NativeTrajectoryLayer sourceId="path-source" layerId="path-layer" shape={shape} variant="authoring" tolerance={0.00001} maxZoomLevel={22} />
      <NativeWaypointLayer sourceId="waypoint-source" layerId="waypoint-layer" shape={shape} variant="authoring" tolerance={0.00001} maxZoomLevel={22} />
    </>);
  });
  for (const source of renderer!.root.findAllByType("ShapeSource")) {
    expect(source.props.tolerance).toBe(0.00001);
    expect(source.props.maxZoomLevel).toBe(22);
  }
  expect(renderer!.root.findByType("LineLayer").props).toMatchObject({
    id: "path-layer",
    filter: ["==", ["get", "kind"], "line"],
    style: { lineColor: "#A855F7", lineWidth: 4, lineJoin: "round", lineCap: "round", lineOpacity: 0.96, lineBlur: 0.15 },
  });
  expect(renderer!.root.findByType("CircleLayer").props).toMatchObject({
    id: "waypoint-layer",
    style: { circleRadius: 6, circleColor: "#ef4444", circleStrokeColor: "#ffffff", circleStrokeWidth: 2 },
  });
});
