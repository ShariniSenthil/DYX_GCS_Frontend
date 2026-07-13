// ============================================================
// Residual Formatter
// ============================================================
//
// Formats a residual value in meters with 2-decimal rounding
// and the unit label " m".
//
// Requirements: 15.3

/**
 * Format a residual value in meters with 2-decimal rounding.
 *
 * Examples:
 *   0.032 → "0.03 m"
 *   1.5   → "1.50 m"
 *   0     → "0.00 m"
 *
 * @param x - Residual value in meters (finite, non-negative)
 * @returns Formatted string with " m" suffix
 */
export function formatResidualMeters(x: number): string {
  return `${x.toFixed(2)} m`;
}
