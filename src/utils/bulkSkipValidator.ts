export type BulkSkipInput = {
  from: number;
  to: number;
  current: number;
  total: number;
};

/**
 * Validate bulk skip inputs. Returns null when valid, otherwise an error message.
 */
export function validateBulkSkip(input: BulkSkipInput): string | null {
  const { from, to, current, total } = input;

  if (!Number.isFinite(from) || !Number.isFinite(to)) return 'Please enter valid numbers';
  if (from < 1 || to < 1) return 'Waypoints must be >= 1';
  if (to < from) return 'To must be >= From';
  if (from < current) return 'Cannot skip already completed waypoints';
  if (to >= total) return 'Range cannot include last waypoint or finish mission';
  return null;
}
