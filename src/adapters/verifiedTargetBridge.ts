/**
 * verifiedTargetBridge — VerifiedTargetStatusEntry → LegacyWpStatus
 *
 * Bridges the 4-wheel progress map (keyed by 0-based target_index) into the
 * LegacyWpStatus shape (keyed by 1-based wp.sn) consumed by WaypointsTable,
 * MissionMap, and MissionProgressCard. Those components need no changes.
 *
 * Status mapping (ALL terminal statuses are preserved as distinct values):
 *   pending   → 'pending'
 *   active    → 'loading'
 *   arrived   → 'reached'
 *   settling  → 'reached'
 *   marking   → 'marked'
 *   completed → 'completed'
 *   failed    → 'failed'    ← DISTINCT — never mapped to 'skipped'
 *   skipped   → 'skipped'
 *   stopped   → 'stopped'   ← DISTINCT — never mapped to 'passed'
 *   aborted   → 'aborted'   ← DISTINCT — never mapped to 'skipped'
 *
 * These three statuses require LegacyWpStatus.status to include 'failed',
 * 'stopped', and 'aborted' (done in Phase 3 via px4PointStatusBridge.ts edit).
 *
 * Index mapping: target_index 0 → sn 1, target_index N → sn N+1
 */

import type {
  VerifiedTargetStatusEntry,
  VerifiedTargetStatusKey,
} from '../types/fourwd/mission';
import type { LegacyWpStatus } from './px4PointStatusBridge';

// ── Status mapping ────────────────────────────────────────────────────────────

const VERIFIED_TO_LEGACY: Record<
  VerifiedTargetStatusKey,
  LegacyWpStatus['status']
> = {
  pending:   'pending',
  active:    'loading',
  arrived:   'reached',
  settling:  'reached',
  marking:   'marked',
  completed: 'completed',
  failed:    'failed',
  skipped:   'skipped',
  stopped:   'stopped',
  aborted:   'aborted',
};

// ── Conversion ────────────────────────────────────────────────────────────────

/**
 * Convert verifiedProgressMap (keyed by 0-based target_index) to a LegacyWpStatus
 * map keyed by 1-based wp.sn, suitable for direct use as effectiveStatusMap.
 */
export function verifiedProgressToLegacy(
  verifiedMap: Record<number, VerifiedTargetStatusEntry>,
): Record<number, LegacyWpStatus> {
  const out: Record<number, LegacyWpStatus> = {};

  for (const [idxStr, entry] of Object.entries(verifiedMap)) {
    const targetIndex = parseInt(idxStr, 10);
    if (!Number.isFinite(targetIndex)) continue;

    const sn = targetIndex + 1; // 0-based target_index → 1-based wp.sn
    const uiStatus = VERIFIED_TO_LEGACY[entry.status] ?? 'pending';

    out[sn] = {
      status: uiStatus,
      reached:
        uiStatus === 'reached' ||
        uiStatus === 'marked' ||
        uiStatus === 'completed' ||
        uiStatus === 'loading',
      marked: uiStatus === 'marked' || uiStatus === 'completed',
      timestamp: entry.timestamp,
      remark: entry.reason ?? entry.message,
      lat_achieved: entry.lat_achieved,
      lon_achieved: entry.lon_achieved,
    };
  }

  return out;
}
