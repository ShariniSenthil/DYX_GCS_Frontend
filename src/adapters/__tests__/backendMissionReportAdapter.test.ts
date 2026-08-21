import {
  reconcileMissionReportRow,
  type MissionReportRowStatus,
} from "../backendMissionReportAdapter";

describe(
  "canonical Mission Report terminal reconciliation",
  () => {
    const pendingReportRow:
      MissionReportRowStatus = {
        reached: false,
        marked: false,
        status: "pending",
        timestamp:
          "2026-08-21T10:00:00.000Z",
        remark:
          "Along — | Cross — | Overall —",
      };

    test(
      "promotes runtime COMPLETED when canonical report still says PENDING",
      () => {
        const result =
          reconcileMissionReportRow(
            pendingReportRow,
            {
              reached: true,
              marked: true,
              status: "completed",
              timestamp:
                "2026-08-21T10:00:01.000Z",
            },
          );

        expect(result).toEqual({
          reached: true,
          marked: true,
          status: "completed",
          timestamp:
            "2026-08-21T10:00:01.000Z",
          remark:
            "Along — | Cross — | Overall —",
        });
      },
    );

    test(
      "synthesizes missing final FAILED row from terminal runtime snapshot",
      () => {
        const result =
          reconcileMissionReportRow(
            undefined,
            {
              status: "failed",
              timestamp:
                "2026-08-21T10:00:02.000Z",
            },
          );

        expect(result).toEqual({
          reached: true,
          marked: false,
          status: "failed",
          timestamp:
            "2026-08-21T10:00:02.000Z",
          remark:
            "Along — | Cross — | Overall —",
        });
      },
    );

    test(
      "never allows runtime state to overwrite canonical terminal report status",
      () => {
        const canonical:
          MissionReportRowStatus = {
            reached: true,
            marked: true,
            status: "completed",
            timestamp:
              "2026-08-21T10:00:03.000Z",
            remark:
              "Along +3.0 mm | Cross -2.0 mm | Overall 3.6 mm",
          };

        const result =
          reconcileMissionReportRow(
            canonical,
            {
              reached: false,
              marked: false,
              status: "failed",
              timestamp:
                "2026-08-21T10:00:04.000Z",
            },
          );

        expect(result).toBe(
          canonical,
        );
      },
    );

    test(
      "canonical RPP accuracy remark survives temporary terminal fallback",
      () => {
        const report:
          MissionReportRowStatus = {
            reached: false,
            marked: false,
            status: "pending",
            timestamp:
              "2026-08-21T10:00:00.000Z",
            remark:
              "Along +4.0 mm | Cross +3.0 mm | Overall 5.0 mm",
          };

        const result =
          reconcileMissionReportRow(
            report,
            {
              reached: true,
              marked: true,
              status: "completed",
              timestamp:
                "2026-08-21T10:00:05.000Z",
            },
          );

        expect(
          result?.status,
        ).toBe(
          "completed",
        );

        expect(
          result?.remark,
        ).toBe(
          "Along +4.0 mm | Cross +3.0 mm | Overall 5.0 mm",
        );
      },
    );

    test(
      "does not promote a non-terminal runtime state over canonical PENDING",
      () => {
        const result =
          reconcileMissionReportRow(
            pendingReportRow,
            {
              reached: true,
              status: "reached",
              timestamp:
                "2026-08-21T10:00:06.000Z",
            },
          );

        expect(result).toBe(
          pendingReportRow,
        );
      },
    );

    test(
      "repairs DASH mission_end without importing legacy remark",
      () => {
        const result =
          reconcileMissionReportRow(
            pendingReportRow,
            {
              reached: true,
              marked: true,
              status: "mission_end",
              timestamp:
                "2026-08-21T10:00:07.000Z",
            },
          );

        expect(
          result?.status,
        ).toBe(
          "mission_end",
        );

        expect(
          result?.remark,
        ).toBe(
          "Along — | Cross — | Overall —",
        );
      },
    );
  },
);