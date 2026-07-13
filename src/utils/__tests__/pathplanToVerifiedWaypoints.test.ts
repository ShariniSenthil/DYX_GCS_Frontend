import {
  pathplanToVerifiedWaypoints,
  buildValidationErrorMessage,
} from '../pathplanToVerifiedWaypoints';
import type { PathPlanWaypoint } from '../../types/pathplan';

const baseWp = (overrides: Partial<PathPlanWaypoint> = {}): PathPlanWaypoint => ({
  id: 1,
  lat: 12.345,
  lon: 78.901,
  alt: 10,
  mark: true,
  ...overrides,
});

describe('pathplanToVerifiedWaypoints', () => {
  describe('valid input', () => {
    it('converts a single fully-valid waypoint', () => {
      const { waypoints, errors } = pathplanToVerifiedWaypoints([baseWp()]);
      expect(errors).toHaveLength(0);
      expect(waypoints).toHaveLength(1);
      expect(waypoints[0].lat).toBe(12.345);
      expect(waypoints[0].mark).toBe(true);
      expect(waypoints[0].index).toBe(0);
    });

    it('preserves mark: false explicitly', () => {
      const { waypoints, errors } = pathplanToVerifiedWaypoints([baseWp({ mark: false })]);
      expect(errors).toHaveLength(0);
      expect(waypoints[0].mark).toBe(false);
    });

    it('allows mark: undefined when requireMark is false', () => {
      const { waypoints, errors } = pathplanToVerifiedWaypoints(
        [baseWp({ mark: undefined })],
        { requireMark: false },
      );
      expect(errors).toHaveLength(0);
      expect(waypoints).toHaveLength(1);
    });
  });

  describe('reject-all semantics', () => {
    it('rejects ALL waypoints when any one is invalid (not just the bad one)', () => {
      const wps = [
        baseWp({ lat: 12.0 }),
        baseWp({ lat: NaN }),  // invalid
        baseWp({ lat: 13.0 }),
      ];
      const { waypoints, errors } = pathplanToVerifiedWaypoints(wps);
      expect(errors.length).toBeGreaterThan(0);
      expect(waypoints).toHaveLength(0); // entire batch rejected
    });

    it('reports ALL errors simultaneously, not just the first', () => {
      const wps = [baseWp({ lat: NaN }), baseWp({ lon: NaN }), baseWp({ mark: undefined })];
      const { errors } = pathplanToVerifiedWaypoints(wps);
      // lat error + lon error + mark error — at least 3 distinct errors
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('coordinate validation', () => {
    it('rejects lat out of range', () => {
      const { errors } = pathplanToVerifiedWaypoints([baseWp({ lat: 91 })]);
      expect(errors.some(e => e.field === 'lat')).toBe(true);
    });

    it('rejects lon out of range', () => {
      const { errors } = pathplanToVerifiedWaypoints([baseWp({ lon: 181 })]);
      expect(errors.some(e => e.field === 'lon')).toBe(true);
    });

    it('rejects null island (0, 0)', () => {
      const { errors } = pathplanToVerifiedWaypoints([baseWp({ lat: 0, lon: 0 })]);
      expect(errors.some(e => e.field === 'coords')).toBe(true);
    });

    it('allows (0, 78) — zero lat with valid lon is allowed', () => {
      // Only (0, 0) simultaneously is rejected, not zero lat alone
      const { errors } = pathplanToVerifiedWaypoints([baseWp({ lat: 0, lon: 78 })]);
      expect(errors.some(e => e.field === 'coords')).toBe(false);
    });
  });

  describe('mark validation', () => {
    it('rejects undefined mark when requireMark is true (default)', () => {
      const { errors } = pathplanToVerifiedWaypoints([baseWp({ mark: undefined })]);
      expect(errors.some(e => e.field === 'mark')).toBe(true);
    });

    it('NEVER defaults mark to true — undefined is an error', () => {
      const { waypoints } = pathplanToVerifiedWaypoints(
        [baseWp({ mark: undefined })],
        { requireMark: false },
      );
      // When requireMark=false, undefined mark is allowed but stays undefined
      expect(waypoints[0].mark).toBe(undefined as any);
    });
  });

  describe('index mapping', () => {
    it('assigns 0-based index matching source position', () => {
      const wps = [baseWp(), baseWp({ lat: 13.0 })];
      const { waypoints } = pathplanToVerifiedWaypoints(wps);
      expect(waypoints[0].index).toBe(0);
      expect(waypoints[1].index).toBe(1);
    });
  });
});

describe('buildValidationErrorMessage', () => {
  it('groups errors by waypoint number', () => {
    const errors = [
      { waypointNumber: 1, field: 'lat' as const, reason: 'lat is NaN' },
      { waypointNumber: 1, field: 'mark' as const, reason: 'mark is not set' },
      { waypointNumber: 3, field: 'lon' as const, reason: 'lon is 999' },
    ];
    const msg = buildValidationErrorMessage(errors);
    expect(msg).toContain('Waypoint 1');
    expect(msg).toContain('lat is NaN');
    expect(msg).toContain('mark is not set');
    expect(msg).toContain('Waypoint 3');
    expect(msg).toContain('lon is 999');
  });

  it('returns empty string for empty array', () => {
    expect(buildValidationErrorMessage([])).toBe('');
  });
});
