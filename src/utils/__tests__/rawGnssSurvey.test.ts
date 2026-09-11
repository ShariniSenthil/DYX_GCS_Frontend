import {
  extractRawGnssSurvey,
  pickBestRawGnssSurvey,
  surveyFromRadialMm,
} from "../rawGnssSurvey";

describe("rawGnssSurvey", () => {
  test("extracts nested point_results accuracy.survey", () => {
    const survey = extractRawGnssSurvey({
      accuracy: {
        survey: {
          available: true,
          radial_error_mm: 4.2,
        },
      },
    });

    expect(survey?.available).toBe(true);
    expect(survey?.radial_error_mm).toBe(4.2);
  });

  test("synthesizes a display snapshot from a terminal radial mm", () => {
    expect(surveyFromRadialMm(7.5)).toEqual({
      measurement_source: "RAW_GNSS_SURVEY",
      available: true,
      radial_error_mm: 7.5,
    });
    expect(surveyFromRadialMm(null)).toBeNull();
  });

  test("does not let an unavailable runtime survey hide a good report", () => {
    const chosen = pickBestRawGnssSurvey(
      { available: false, reason: "pending" },
      { available: true, radial_error_mm: 3.1 },
    );

    expect(chosen?.radial_error_mm).toBe(3.1);
    expect(chosen?.available).toBe(true);
  });

  test("reads radial from a waypoint_marked event blob", () => {
    const survey = extractRawGnssSurvey({
      data: {
        accuracy: {
          survey: { available: true, radial_error_mm: 9 },
        },
      },
    });

    expect(survey?.radial_error_mm).toBe(9);
  });
});
