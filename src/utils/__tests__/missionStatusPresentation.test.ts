import { getMissionProgressRef } from "../missionStatusPresentation";

describe("getMissionProgressRef", () => {
  test("uses mission order rather than editable waypoint serial numbers", () => {
    expect(
      getMissionProgressRef(
        [{ sn: 2 }, { sn: 3 }, { sn: 4 }],
        2,
        true,
      ),
    ).toEqual({ current: 3, total: 3 });
  });

  test("does not show an out-of-range active point", () => {
    expect(
      getMissionProgressRef([{ sn: 2 }, { sn: 4 }, { sn: 7 }], 3, true),
    ).toEqual({ current: 0, total: 3 });
  });
});
