import { PathPlanWaypoint } from '../types/pathplan';
import { recalculateWaypointDistances } from './missionCalculator';

/**
 * Traverse axis — determines how groups are formed and sorted.
 *
 * EAST_WEST:  Rows run horizontally. Groups by latitude, advance top→bottom.
 * WEST_EAST:  Rows run horizontally. Groups by latitude, advance bottom→top.
 * NORTH_SOUTH: Columns run vertically. Groups by longitude, advance left→right.
 * SOUTH_NORTH: Columns run vertically. Groups by longitude, advance right→left.
 */
export type PathAxis = 'EAST_WEST' | 'WEST_EAST' | 'NORTH_SOUTH' | 'SOUTH_NORTH';

/**
 * Direction within each group row/column.
 *
 * LEFT_RIGHT:  First group goes left→right (or top→bottom for columns).
 * RIGHT_LEFT:  First group goes right→left (or bottom→top for columns).
 */
export type PathDirection = 'LEFT_RIGHT' | 'RIGHT_LEFT';

export interface OptimizePathOptions {
  axis: PathAxis;
  direction: PathDirection;
}

// ~0.00001° latitude ≈ 1.1m — good threshold for rover row detection.
const GROUP_THRESHOLD = 0.00001;

/**
 * Group-by configuration for each axis mode.
 * groupKey: which coordinate to group by.
 * groupSortDir: how to sort groups (1 = ascending, -1 = descending).
 * inGroupSortKey: which coordinate to sort within groups.
 * inGroupSortDir: how to sort within groups (1 = ascending, -1 = descending).
 */
interface GroupConfig {
  groupKey: 'lat' | 'lon';
  groupSortDir: 1 | -1;
  inGroupSortKey: 'lat' | 'lon';
  inGroupSortDir: 1 | -1;
}

const GROUP_CONFIGS: Record<PathAxis, GroupConfig> = {
  EAST_WEST: {
    groupKey: 'lat',
    groupSortDir: -1,   // groups sorted top→bottom (lat DESC)
    inGroupSortKey: 'lon',
    inGroupSortDir: 1,  // within group: left→right (lon ASC)
  },
  WEST_EAST: {
    groupKey: 'lat',
    groupSortDir: 1,    // groups sorted bottom→top (lat ASC)
    inGroupSortKey: 'lon',
    inGroupSortDir: -1, // within group: right→left (lon DESC)
  },
  NORTH_SOUTH: {
    groupKey: 'lon',
    groupSortDir: 1,    // groups sorted left→right (lon ASC)
    inGroupSortKey: 'lat',
    inGroupSortDir: -1, // within group: top→bottom (lat DESC)
  },
  SOUTH_NORTH: {
    groupKey: 'lon',
    groupSortDir: -1,   // groups sorted right→left (lon DESC)
    inGroupSortKey: 'lat',
    inGroupSortDir: 1,  // within group: bottom→top (lat ASC)
  },
};

/**
 * Group points by proximity on the grouping coordinate.
 * Uses sort-then-merge: sort by group key, then merge consecutive
 * points within threshold distance into the same group.
 *
 * O(n log n) for the sort, O(n) for the merge.
 */
function groupByAxis(
  points: PathPlanWaypoint[],
  config: GroupConfig,
): PathPlanWaypoint[][] {
  const { groupKey, groupSortDir } = config;

  const sorted = [...points].sort((a, b) => {
    return groupSortDir * (a[groupKey] - b[groupKey]);
  });

  const groups: PathPlanWaypoint[][] = [];
  let currentGroup: PathPlanWaypoint[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevKey = sorted[i - 1][groupKey];
    const currKey = sorted[i][groupKey];

    if (Math.abs(currKey - prevKey) <= GROUP_THRESHOLD) {
      currentGroup.push(sorted[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  groups.push(currentGroup);

  return groups;
}

/**
 * Sort waypoints within each group by the in-group coordinate.
 * O(m log m) per group, O(n log n) total across all groups.
 */
function sortGroupInternally(
  groups: PathPlanWaypoint[][],
  config: GroupConfig,
): PathPlanWaypoint[][] {
  const { inGroupSortKey, inGroupSortDir } = config;

  return groups.map(group =>
    [...group].sort((a, b) => inGroupSortDir * (a[inGroupSortKey] - b[inGroupSortKey])),
  );
}

/**
 * Apply boustrophedon (zig-zag) reversal to alternate groups.
 *
 * LEFT_RIGHT: even groups keep natural order, odd groups reverse.
 * RIGHT_LEFT: even groups reverse, odd groups keep natural order.
 *
 * This creates the classic "mowing the lawn" pattern where
 * the rover doesn't waste time traveling back to the start of each row.
 */
function applyZigZag(
  groups: PathPlanWaypoint[][],
  direction: PathDirection,
): PathPlanWaypoint[][] {
  return groups.map((group, index) => {
    const shouldReverse =
      (index % 2 === 1 && direction === 'LEFT_RIGHT') ||
      (index % 2 === 0 && direction === 'RIGHT_LEFT');

    return shouldReverse ? [...group].reverse() : group;
  });
}

/**
 * Deterministic path reorder for structured grid traversal.
 *
 * This is NOT a path planning, clustering, or TSP algorithm.
 * It groups points into rows/columns by proximity, sorts within
 * each group, and applies boustrophedon (zig-zag) traversal.
 *
 * All operations are O(n log n) or better. No mutation of input.
 *
 * Returns a NEW array with IDs reassigned 1..N and distances
 * recalculated from consecutive pairs using Vincenty formula.
 */
export function optimizePath(
  points: PathPlanWaypoint[],
  options: OptimizePathOptions,
): PathPlanWaypoint[] {
  if (points.length === 0) return [];
  if (points.length <= 1) return [{ ...points[0], id: 1, distance: 0 }];

  const { axis, direction } = options;
  const config = GROUP_CONFIGS[axis];

  // Step 1: Group by secondary axis — O(n log n)
  const groups = groupByAxis(points, config);

  // Step 2: Sort within each group — O(n log n) total
  const sortedGroups = sortGroupInternally(groups, config);

  // Step 3: Apply zig-zag reversal — O(n)
  const zigZagged = applyZigZag(sortedGroups, direction);

  // Step 4: Flatten — O(n)
  const flattened = zigZagged.flat();

  // Step 5: Validate — no missing or duplicate waypoints
  if (flattened.length !== points.length) {
    console.error(
      `[optimizePath] Length mismatch: input=${points.length}, output=${flattened.length}. ` +
      `Falling back to input with re-sequenced IDs.`,
    );
    return recalculateWaypointDistances(
      points.map((wp, i) => ({ ...wp, id: i + 1 })),
    );
  }

  // Step 6: Reassign sequential IDs and recalculate distances — O(n)
  const resequenced = flattened.map((wp, index) => ({
    ...wp,
    id: index + 1,
  }));

  return recalculateWaypointDistances(resequenced);
}