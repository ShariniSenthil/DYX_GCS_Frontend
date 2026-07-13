import { validateBulkSkip } from '../bulkSkipValidator';

describe('validateBulkSkip', () => {
  test('valid range returns null', () => {
    const err = validateBulkSkip({ from: 3, to: 5, current: 2, total: 10 });
    expect(err).toBeNull();
  });

  test('non-finite numbers', () => {
    const err = validateBulkSkip({ from: NaN, to: 5, current: 1, total: 10 });
    expect(err).toBe('Please enter valid numbers');
  });

  test('from < 1', () => {
    expect(validateBulkSkip({ from: 0, to: 2, current: 1, total: 10 })).toBe('Waypoints must be >= 1');
  });

  test('to < from', () => {
    expect(validateBulkSkip({ from: 5, to: 4, current: 1, total: 10 })).toBe('To must be >= From');
  });

  test('from < current', () => {
    expect(validateBulkSkip({ from: 2, to: 4, current: 3, total: 10 })).toBe('Cannot skip already completed waypoints');
  });

  test('to >= total', () => {
    expect(validateBulkSkip({ from: 8, to: 10, current: 5, total: 10 })).toBe('Range cannot include last waypoint or finish mission');
  });
});
