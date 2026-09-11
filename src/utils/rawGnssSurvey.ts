import type { RawGnssSurveySnapshot } from "../services/missionApi";

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function surveyFromRadialMm(
  radialErrorMm: unknown,
  extras?: Partial<RawGnssSurveySnapshot>,
): RawGnssSurveySnapshot | null {
  const radial = finiteNumber(radialErrorMm);
  if (radial === null || radial < 0) {
    return null;
  }

  return {
    measurement_source: "RAW_GNSS_SURVEY",
    available: true,
    radial_error_mm: radial,
    ...extras,
  };
}

/**
 * Pull a RAW GNSS survey object out of a point_results / report / event blob.
 */
export function extractRawGnssSurvey(
  source: unknown,
): RawGnssSurveySnapshot | null {
  const root = asRecord(source);
  if (!root) {
    return null;
  }

  const nested =
    asRecord(root.survey) ??
    asRecord(asRecord(root.accuracy)?.survey) ??
    asRecord(asRecord(root.data)?.survey) ??
    asRecord(asRecord(asRecord(root.data)?.accuracy)?.survey);

  const candidate = nested ?? (root.available !== undefined ? root : null);
  if (!candidate) {
    return surveyFromRadialMm(
      root.radial_error_mm ??
        root.overall_accuracy_mm ??
        asRecord(root.accuracy)?.radial_error_mm,
    );
  }

  const radial = finiteNumber(
    candidate.radial_error_mm ?? candidate.overall_accuracy_mm,
  );
  const available = candidate.available === true || radial !== null;

  if (!available && radial === null && candidate.available !== false) {
    return null;
  }

  return {
    ...(candidate as RawGnssSurveySnapshot),
    available,
    radial_error_mm: radial ?? (candidate.radial_error_mm as number | null),
  };
}

function scoreSurvey(
  survey: RawGnssSurveySnapshot | null | undefined,
): number {
  if (!survey) {
    return -1;
  }
  const radial = finiteNumber(survey.radial_error_mm);
  if (survey.available === true && radial !== null) {
    return 3;
  }
  if (radial !== null) {
    return 2;
  }
  if (survey.available === true) {
    return 1;
  }
  if (survey.available === false) {
    return 0;
  }
  return -1;
}

/**
 * Prefer a frozen available+radial snapshot. Never let an empty
 * runtime object hide a good report/event value.
 */
export function pickBestRawGnssSurvey(
  ...candidates: Array<RawGnssSurveySnapshot | null | undefined>
): RawGnssSurveySnapshot | null {
  let best: RawGnssSurveySnapshot | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = scoreSurvey(candidate);
    if (score > bestScore) {
      best = candidate ?? null;
      bestScore = score;
    }
  }

  return bestScore >= 0 ? best : null;
}
