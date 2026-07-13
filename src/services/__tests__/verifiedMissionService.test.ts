/**
 * verifiedMissionService tests — verifies that each function calls the
 * correct endpoint from FOURWD_MISSION (not px4Endpoints) and passes
 * the right body shape.
 */

import { FOURWD_MISSION } from '../../config/fourwdEndpoints';

// Mock apiClient before importing the service
jest.mock('../../services/apiClient', () => ({
  apiPost: jest.fn(),
  apiGet: jest.fn(),
}));

import { apiPost, apiGet } from '../../services/apiClient';
import {
  uploadVerifiedMission,
  getVerifiedMission,
  startVerifiedMission,
  clearVerifiedMission,
} from '../verifiedMissionService';

const mockApiPost = apiPost as jest.MockedFunction<typeof apiPost>;
const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('uploadVerifiedMission', () => {
  it('POSTs to FOURWD_MISSION.UPLOAD_WAYPOINTS', async () => {
    mockApiPost.mockResolvedValue({ success: true, mission_id: 'abc', total_targets: 3 });
    const req = {
      mission_name: 'Test',
      waypoints: [{ index: 0, lat: 12, lon: 78, alt: 0, mark: true }],
    };
    await uploadVerifiedMission(req);
    expect(mockApiPost).toHaveBeenCalledWith(FOURWD_MISSION.UPLOAD_WAYPOINTS, req);
  });

  it('returns the server response', async () => {
    const resp = { success: true, mission_id: 'xyz', total_targets: 5 };
    mockApiPost.mockResolvedValue(resp);
    const result = await uploadVerifiedMission({ mission_name: 'T', waypoints: [] });
    expect(result).toEqual(resp);
  });
});

describe('getVerifiedMission', () => {
  it('GETs from FOURWD_MISSION.GET(id)', async () => {
    mockApiGet.mockResolvedValue({ mission_id: 'abc', mission_name: 'T', total_targets: 3 });
    await getVerifiedMission('abc');
    expect(mockApiGet).toHaveBeenCalledWith(FOURWD_MISSION.GET('abc'));
  });

  it('URL-encodes the mission ID', async () => {
    mockApiGet.mockResolvedValue({ mission_id: 'a b', mission_name: 'T', total_targets: 1 });
    await getVerifiedMission('a b');
    const calledUrl = (mockApiGet.mock.calls[0] as string[])[0];
    expect(calledUrl).toContain('a%20b');
  });
});

describe('startVerifiedMission', () => {
  it('POSTs to FOURWD_MISSION.START with mission_id in body', async () => {
    mockApiPost.mockResolvedValue({ success: true });
    await startVerifiedMission('mission-123');
    expect(mockApiPost).toHaveBeenCalledWith(FOURWD_MISSION.START, { mission_id: 'mission-123' });
  });

  it('does NOT call any px4 endpoint', async () => {
    mockApiPost.mockResolvedValue({ success: true });
    await startVerifiedMission('m1');
    const url = (mockApiPost.mock.calls[0] as string[])[0];
    expect(url).not.toContain('px4');
    expect(url).not.toContain('PX4');
  });
});

describe('clearVerifiedMission', () => {
  it('POSTs to FOURWD_MISSION.CLEAR', async () => {
    mockApiPost.mockResolvedValue({ cleared: true, status: { loaded: false } });
    await clearVerifiedMission();
    expect(mockApiPost).toHaveBeenCalledWith(FOURWD_MISSION.CLEAR);
  });
});

// ── Backend response shape contracts (tests 13 & 14) ───────────────────────────
// Confirmed 4WD_SERVER contract: start returns { state, message } — no `success`.
// Clear returns { cleared, status } — no `success`.
// These tests verify the service passes through the real shapes without transformation.

describe('startVerifiedMission — real backend response shape', () => {
  it('returns { state, message } when backend returns that shape (no success field)', async () => {
    const backendResp = { state: 'running', message: 'Mission started' };
    mockApiPost.mockResolvedValue(backendResp);
    const result = await startVerifiedMission('mid-123');
    expect(result.state).toBe('running');
    expect(result.message).toBe('Mission started');
    // success is NOT present in the real backend response
    expect(result.success).toBeUndefined();
  });

  it('returns { state: "arming" } shape without wrapping or transforms', async () => {
    mockApiPost.mockResolvedValue({ state: 'arming', message: 'Arming FCU...' });
    const result = await startVerifiedMission('mid-456');
    expect(result.state).toBe('arming');
  });
});

describe('clearVerifiedMission — real backend response shape', () => {
  it('returns { cleared, status } when backend returns that shape (no success field)', async () => {
    const backendResp = { cleared: true, status: { loaded: false, name: null, mission_id: null } };
    mockApiPost.mockResolvedValue(backendResp);
    const result = await clearVerifiedMission();
    expect(result.cleared).toBe(true);
    expect(result.status.loaded).toBe(false);
    // success is NOT present in the real backend response
    expect((result as any).success).toBeUndefined();
  });
});
