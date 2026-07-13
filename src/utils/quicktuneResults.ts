/**
 * QuickTune Results Computation Utilities
 *
 * Pure functions for computing and comparing parameter changes
 * during the QuickTune process. Testable without React Native dependencies.
 */

import { TUNED_PARAMS } from '../types/quicktune';

// ============================================================================
// Types
// ============================================================================

export interface ParamChange {
  name: string;
  before: number;
  after: number;
  changePercent: number;
}

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Compute tune results by comparing before/after parameter values.
 * Returns an array of param changes sorted by absolute change percentage (descending).
 *
 * @param before - Record of parameter names to their before values
 * @param after - Record of parameter names to their after values
 * @returns Array of ParamChange objects sorted by |changePercent| descending
 */
export function computeTuneResults(
  before: Record<string, number>,
  after: Record<string, number>,
): ParamChange[] {
  return TUNED_PARAMS.map((paramName) => {
    const beforeValue = before[paramName] ?? 0;
    const afterValue = after[paramName] ?? 0;

    let changePercent = 0;
    if (beforeValue !== 0) {
      changePercent = ((afterValue - beforeValue) / Math.abs(beforeValue)) * 100;
    } else if (afterValue !== 0) {
      // beforeValue is 0 — percentage change is mathematically undefined.
      // Cap at ±999% to signal a large change without implying a precise ratio.
      // Sign reflects direction: positive if value increased from zero, negative if it decreased.
      changePercent = afterValue > 0 ? 999 : -999;
    }

    return {
      name: paramName,
      before: beforeValue,
      after: afterValue,
      changePercent: Math.round(changePercent * 100) / 100,
    };
  }).sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}
