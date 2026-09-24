import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { AccuracyMonitorCard } from "../AccuracyMonitorCard";
import { DistanceToTargetCard } from "../DistanceToTargetCard";
import { liveDataStateLabel, type LiveDataState } from "../../../utils/liveDataState";

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock("react-native-gesture-handler", () => ({ GestureDetector: "GestureDetector" }));
jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));

let renderer: ReturnType<typeof TestRenderer.create> | undefined;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
const previousRequestFrame = globalThis.requestAnimationFrame;
const previousCancelFrame = globalThis.cancelAnimationFrame;

beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  // Deliberately never execute a frame: fresh telemetry must render immediately.
  globalThis.requestAnimationFrame = jest.fn(() => 1);
  globalThis.cancelAnimationFrame = jest.fn();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});
afterAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  globalThis.requestAnimationFrame = previousRequestFrame;
  globalThis.cancelAnimationFrame = previousCancelFrame;
});

function render(element: React.ReactElement) {
  act(() => {
    if (renderer) renderer.update(element);
    else renderer = TestRenderer.create(element);
  });
  return renderer!.root.findAllByType("Text").map((node: any) => node.props.children) as string[];
}

const sample = {
  isMissionActive: true,
  alongSideMm: 110.9,
  alongSidePosition: "before_point",
  crossTrackMm: -210.9,
  crossTrackSide: "right",
  actualSpeedMps: 1.25,
  targetHeadingDeg: 350,
  headingErrorDeg: 3.5,
  distanceToGoalM: 4.25,
};

test("all monitor values reflect each new sample without animation frames", () => {
  render(<AccuracyMonitorCard {...sample} />);
  const text = render(<AccuracyMonitorCard {...sample}
    alongSideMm={211.9} crossTrackMm={-311.9} actualSpeedMps={2.5}
    targetHeadingDeg={370} headingErrorDeg={-4.5} distanceToGoalM={3.5}
  />);
  expect(text).toEqual(expect.arrayContaining([
    "211 mm", "-311 mm", "2.50 m/s", "10.0°", "-4.5°", "3.50 m",
    "BEFORE POINT", "RIGHT",
  ]));
  const next = render(<AccuracyMonitorCard {...sample}
    alongSideMm={-0.9} crossTrackMm={0.9} targetHeadingDeg={-10}
  />);
  expect(next.filter((value) => value === "0 mm")).toHaveLength(2);
  expect(next).toEqual(expect.arrayContaining(["350.0°", "+3.5°"]));
});

test("overall accuracy immediately renders the latest truncated measurement", () => {
  render(<DistanceToTargetCard isMissionActive accuracyAvailable overallAccuracyMm={10.9} />);
  expect(render(<DistanceToTargetCard isMissionActive accuracyAvailable
    overallAccuracyMm={110.9} accuracyStatus="ACCURACY_PASS"
  />)).toEqual(expect.arrayContaining(["110 mm", "ACCURACY PASS"]));
});

test.each<LiveDataState>(["stale", "offline", "inactive", "waiting", "unavailable"])(
  "%s hides all received measurements and retains the availability label", (dataState) => {
    const cards = (state: LiveDataState) => <>
      <AccuracyMonitorCard {...sample} dataState={state} />
      <DistanceToTargetCard isMissionActive accuracyAvailable overallAccuracyMm={110} dataState={state} />
    </>;
    render(cards("live"));
    const text = render(cards(dataState));
    expect(text.filter((value) => value === "--")).toHaveLength(7);
    expect(text).toContain(liveDataStateLabel(dataState));
  },
);

test.each([null, undefined, NaN, Infinity, -Infinity])(
  "invalid measurement %s remains unavailable", (value) => {
    const cards = (measurement: number | null | undefined) => <>
      <AccuracyMonitorCard isMissionActive dataState="live"
        alongSideMm={measurement} crossTrackMm={measurement} actualSpeedMps={measurement}
        targetHeadingDeg={measurement} headingErrorDeg={measurement} distanceToGoalM={measurement}
      />
      <DistanceToTargetCard isMissionActive accuracyAvailable dataState="live" overallAccuracyMm={measurement} />
    </>;
    render(cards(100));
    expect(render(cards(value)).filter((text) => text === "--")).toHaveLength(7);
  },
);

test("default mission and availability gates still suppress values", () => {
  const text = render(<>
    <AccuracyMonitorCard {...sample} isMissionActive={false} />
    <DistanceToTargetCard isMissionActive accuracyAvailable={false} overallAccuracyMm={110} />
    <DistanceToTargetCard isMissionActive accuracyAvailable overallAccuracyMm={-1} />
  </>);
  expect(text.filter((value) => value === "--")).toHaveLength(8);
  expect(text).toEqual(expect.arrayContaining(["MISSION NOT ACTIVE", "WAITING FOR DATA"]));
});
