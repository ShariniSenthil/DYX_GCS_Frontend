import type {
  RoverTelemetry,
} from "../../types/telemetry";

import {
  EMPTY_RPP_ACCURACY_REMARK,
  captureTerminalRppAccuracy,
  formatTerminalRppAccuracy,
  selectMissionReportRemark,
} from "../terminalRppAccuracyFallback";

function makeTelemetry(
  overrides:
    Partial<RoverTelemetry> = {},
): RoverTelemetry {
  return {
    accuracy_available: true,

    front_back_error_mm:
      219.07429371951343,

    cross_track_error_mm:
      50.62153969298667,

    radial_error_mm:
      224.8468066252938,

    accuracy: {
      available: true,
      goal_number: 4,

      front_back_error_mm:
        219.07429371951343,

      cross_track_error_mm:
        50.62153969298667,

      radial_error_mm:
        224.8468066252938,
    },

    mission: {
      total_wp: 4,
      current_wp: 4,
      status: "COMPLETED",
      progress_pct: 100,

      active_point_index: 3,
      active_point_number: 4,
    },

    ...overrides,
  } as RoverTelemetry;
}

describe(
  "terminal RPP accuracy fallback",
  () => {
    test(
      "captures RPP values for matching final point",
      () => {
        const snapshot =
          captureTerminalRppAccuracy(
            makeTelemetry(),
            3,
            "2026-08-21T12:00:00.000Z",
          );

        expect(snapshot).toEqual({
          pointIndex: 3,

          alongTrackErrorMm:
            219.07429371951343,

          crossTrackErrorMm:
            50.62153969298667,

          overallAccuracyMm:
            224.8468066252938,

          capturedAt:
            "2026-08-21T12:00:00.000Z",
        });
      },
    );

    test(
      "formats the terminal accuracy exactly for Mission Report",
      () => {
        const snapshot =
          captureTerminalRppAccuracy(
            makeTelemetry(),
            3,
          );

        expect(snapshot).not.toBeNull();

        expect(
          formatTerminalRppAccuracy(
            snapshot!,
          ),
        ).toBe(
          "Along +219.1 mm | Cross +50.6 mm | Overall 224.8 mm",
        );
      },
    );

    test(
      "rejects telemetry belonging to another goal",
      () => {
        const telemetry =
          makeTelemetry({
            accuracy: {
              available: true,

              goal_number: 3,

              front_back_error_mm:
                20,

              cross_track_error_mm:
                10,

              radial_error_mm:
                22.36,
            },

            // Point index 2 / goal 3 — does NOT match
            // point index 3 (goal 4) in ANY identity dimension.
            mission: {
              total_wp: 4,
              current_wp: 3,
              status: "RUNNING",
              progress_pct: 75,

              active_point_index: 2,
              active_point_number: 3,
            },
          });

        expect(
          captureTerminalRppAccuracy(
            telemetry,
            3,
          ),
        ).toBeNull();
      },
    );

    test(
      "does not capture unavailable accuracy",
      () => {
        const telemetry =
          makeTelemetry({
            accuracy_available:
              false,

            accuracy: {
              available:
                false,

              goal_number:
                4,
            },
          });

        expect(
          captureTerminalRppAccuracy(
            telemetry,
            3,
          ),
        ).toBeNull();
      },
    );

    test(
      "uses frozen terminal accuracy while canonical report has placeholders",
      () => {
        const snapshot =
          captureTerminalRppAccuracy(
            makeTelemetry(),
            3,
          );

        expect(
          selectMissionReportRemark(
            EMPTY_RPP_ACCURACY_REMARK,
            snapshot!,
          ),
        ).toBe(
          "Along +219.1 mm | Cross +50.6 mm | Overall 224.8 mm",
        );
      },
    );

    test(
      "canonical report accuracy always replaces fallback",
      () => {
        const snapshot =
          captureTerminalRppAccuracy(
            makeTelemetry(),
            3,
          );

        expect(
          selectMissionReportRemark(
            "Along +5.0 mm | Cross +2.0 mm | Overall 5.4 mm",
            snapshot!,
          ),
        ).toBe(
          "Along +5.0 mm | Cross +2.0 mm | Overall 5.4 mm",
        );
      },
    );
  },
);