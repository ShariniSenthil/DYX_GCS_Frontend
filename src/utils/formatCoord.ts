/**
 * Safe numeric helpers for untrusted waypoint / telemetry / storage values.
 * Never call Number.prototype.toFixed on a value that might be a string,
 * null, or NaN — that throws and takes down the points table.
 */

export function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function formatCoord(value: unknown, digits = 7): string {
  const n = asFiniteNumber(value);
  return n == null ? "—" : n.toFixed(digits);
}

export function pickLongitude(raw: {
  lon?: unknown;
  lng?: unknown;
  longitude?: unknown;
}): number | null {
  return asFiniteNumber(raw.lon ?? raw.lng ?? raw.longitude);
}

export function pickLatitude(raw: {
  lat?: unknown;
  latitude?: unknown;
}): number | null {
  return asFiniteNumber(raw.lat ?? raw.latitude);
}

export function formatCoordOrZero(value: unknown, digits = 2): string {
  const n = asFiniteNumber(value);
  return n == null ? (0).toFixed(digits) : n.toFixed(digits);
}
