import { verifiedProgressToLegacy } from '../verifiedTargetBridge';
import type { VerifiedTargetStatusEntry } from '../../types/fourwd/mission';

const entry = (status: VerifiedTargetStatusEntry['status']): VerifiedTargetStatusEntry => ({
  status,
  timestamp: '2026-06-30T10:00:00Z',
  eventType: 'target_active',
});

describe('verifiedProgressToLegacy', () => {
  it('converts target_index 0 → sn 1', () => {
    const result = verifiedProgressToLegacy({ 0: entry('active') });
    expect(result[1]).toBeDefined();
    expect(result[0]).toBeUndefined();
  });

  it('maps active → loading', () => {
    const result = verifiedProgressToLegacy({ 0: entry('active') });
    expect(result[1].status).toBe('loading');
  });

  it('maps arrived → reached', () => {
    const result = verifiedProgressToLegacy({ 0: entry('arrived') });
    expect(result[1].status).toBe('reached');
  });

  it('maps settling → reached', () => {
    const result = verifiedProgressToLegacy({ 0: entry('settling') });
    expect(result[1].status).toBe('reached');
  });

  it('maps marking → marked', () => {
    const result = verifiedProgressToLegacy({ 0: entry('marking') });
    expect(result[1].status).toBe('marked');
  });

  it('maps completed → completed', () => {
    const result = verifiedProgressToLegacy({ 0: entry('completed') });
    expect(result[1].status).toBe('completed');
  });

  // Critical: these must remain DISTINCT — never collapsed into each other
  it('maps failed → failed (DISTINCT, not skipped)', () => {
    const result = verifiedProgressToLegacy({ 0: entry('failed') });
    expect(result[1].status).toBe('failed');
    expect(result[1].status).not.toBe('skipped');
  });

  it('maps skipped → skipped (DISTINCT)', () => {
    const result = verifiedProgressToLegacy({ 0: entry('skipped') });
    expect(result[1].status).toBe('skipped');
  });

  it('maps stopped → stopped (DISTINCT, not passed)', () => {
    const result = verifiedProgressToLegacy({ 0: entry('stopped') });
    expect(result[1].status).toBe('stopped');
    expect(result[1].status).not.toBe('passed');
  });

  it('maps aborted → aborted (DISTINCT, not skipped)', () => {
    const result = verifiedProgressToLegacy({ 0: entry('aborted') });
    expect(result[1].status).toBe('aborted');
    expect(result[1].status).not.toBe('skipped');
  });

  it('sets reached=true for arrived status', () => {
    const result = verifiedProgressToLegacy({ 0: entry('arrived') });
    expect(result[1].reached).toBe(true);
  });

  it('sets marked=true for completed status', () => {
    const result = verifiedProgressToLegacy({ 0: entry('completed') });
    expect(result[1].marked).toBe(true);
  });

  it('handles multiple targets with correct sn mapping', () => {
    const result = verifiedProgressToLegacy({
      0: entry('completed'),
      1: entry('active'),
      2: entry('pending'),
    });
    expect(result[1].status).toBe('completed');
    expect(result[2].status).toBe('loading');
    expect(result[3].status).toBe('pending');
  });

  it('returns empty object for empty input', () => {
    expect(verifiedProgressToLegacy({})).toEqual({});
  });

  it('passes through lat_achieved and lon_achieved', () => {
    const e: VerifiedTargetStatusEntry = {
      status: 'arrived',
      timestamp: '2026-06-30T10:00:00Z',
      eventType: 'target_arrived',
      lat_achieved: 12.345,
      lon_achieved: 78.901,
    };
    const result = verifiedProgressToLegacy({ 0: e });
    expect(result[1].lat_achieved).toBe(12.345);
    expect(result[1].lon_achieved).toBe(78.901);
  });
});
