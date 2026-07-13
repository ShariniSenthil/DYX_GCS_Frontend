/**
 * useVerifiedMissionUpload tests — uses react-test-renderer.
 *
 * Key invariants:
 *   1. If ANY waypoint is invalid, upload is never called
 *   2. Context (setLoadedMission) is called ONLY after upload + confirm both succeed
 *   3. If confirmation fails (total_targets mismatch), context is NOT updated
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('../../services/verifiedMissionService', () => ({
  uploadVerifiedMission: jest.fn(),
  getVerifiedMission: jest.fn(),
}));

const mockSetLoadedMission = jest.fn();
jest.mock('../../context/VerifiedMissionContext', () => ({
  useVerifiedMissionContext: () => ({
    missionId: null,
    missionName: null,
    totalTargets: null,
    isLoaded: false,
    setLoadedMission: mockSetLoadedMission,
    clearLoadedMission: jest.fn(),
  }),
}));

jest.mock('../../services/PersistentStorage', () => ({
  default: {
    saveMissionActive: jest.fn().mockResolvedValue(true),
    saveStatusMap: jest.fn().mockResolvedValue(true),
    saveMissionStartTime: jest.fn().mockResolvedValue(true),
    saveMissionEndTime: jest.fn().mockResolvedValue(true),
  },
}));

import { uploadVerifiedMission, getVerifiedMission } from '../../services/verifiedMissionService';
import { useVerifiedMissionUpload } from '../useVerifiedMissionUpload';
import type { PathPlanWaypoint } from '../../types/pathplan';

const mockUpload = uploadVerifiedMission as jest.MockedFunction<typeof uploadVerifiedMission>;
const mockGet = getVerifiedMission as jest.MockedFunction<typeof getVerifiedMission>;

const validWaypoint = (): PathPlanWaypoint => ({
  id: 1,
  lat: 12.345,
  lon: 78.901,
  alt: 10,
  mark: true,
});

// Minimal renderHook using react-test-renderer
function renderHook<T>(useHook: () => T) {
  const ref: { current: T } = { current: undefined as any };

  function Wrapper() {
    ref.current = useHook();
    return null;
  }

  act(() => {
    TestRenderer.create(React.createElement(Wrapper));
  });

  return { result: ref };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useVerifiedMissionUpload', () => {
  describe('validation rejection', () => {
    it('returns failure without calling upload when lat is NaN', async () => {
      const { result } = renderHook(() => useVerifiedMissionUpload());
      let uploadResult: any;

      await act(async () => {
        uploadResult = await result.current.upload([{ ...validWaypoint(), lat: NaN }]);
      });

      expect(uploadResult.success).toBe(false);
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('returns failure without calling upload when mark is undefined', async () => {
      const { result } = renderHook(() => useVerifiedMissionUpload());
      let uploadResult: any;

      await act(async () => {
        uploadResult = await result.current.upload([{ ...validWaypoint(), mark: undefined }]);
      });

      expect(uploadResult.success).toBe(false);
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('includes structured validationErrors in the result', async () => {
      const { result } = renderHook(() => useVerifiedMissionUpload());
      let uploadResult: any;

      await act(async () => {
        uploadResult = await result.current.upload([{ ...validWaypoint(), lat: 0, lon: 0 }]);
      });

      expect(uploadResult.success).toBe(false);
      expect(uploadResult.validationErrors?.length).toBeGreaterThan(0);
    });

    it('returns failure for null island coordinates', async () => {
      const { result } = renderHook(() => useVerifiedMissionUpload());
      let r: any;

      await act(async () => {
        r = await result.current.upload([{ ...validWaypoint(), lat: 0, lon: 0 }]);
      });

      expect(r.success).toBe(false);
      expect(mockUpload).not.toHaveBeenCalled();
    });
  });

  describe('context update ordering', () => {
    it('calls setLoadedMission ONLY after upload and confirm both succeed', async () => {
      mockUpload.mockResolvedValue({ success: true, mission_id: 'mid', total_targets: 1 });
      mockGet.mockResolvedValue({ mission_id: 'mid', mission_name: 'T', total_targets: 1, state: 'stored' as const });

      const { result } = renderHook(() => useVerifiedMissionUpload());

      await act(async () => {
        await result.current.upload([validWaypoint()]);
      });

      expect(mockSetLoadedMission).toHaveBeenCalledTimes(1);
      expect(mockSetLoadedMission).toHaveBeenCalledWith('mid', expect.any(String), 1);
    });

    it('does NOT call setLoadedMission when upload returns success: false', async () => {
      mockUpload.mockResolvedValue({
        success: false,
        mission_id: '',
        total_targets: 0,
        message: 'Server error',
      });

      const { result } = renderHook(() => useVerifiedMissionUpload());

      await act(async () => {
        await result.current.upload([validWaypoint()]);
      });

      expect(mockSetLoadedMission).not.toHaveBeenCalled();
    });

    it('does NOT call setLoadedMission when confirmation reports mismatched total_targets', async () => {
      mockUpload.mockResolvedValue({ success: true, mission_id: 'mid', total_targets: 5 });
      mockGet.mockResolvedValue({ mission_id: 'mid', mission_name: 'T', total_targets: 3, state: 'stored' as const });

      const { result } = renderHook(() => useVerifiedMissionUpload());
      let r: any;

      await act(async () => {
        r = await result.current.upload([validWaypoint()]);
      });

      expect(r.success).toBe(false);
      expect(r.message).toMatch(/mismatch/i);
      expect(mockSetLoadedMission).not.toHaveBeenCalled();
    });
  });

  describe('isUploading state', () => {
    it('is false before upload starts', () => {
      const { result } = renderHook(() => useVerifiedMissionUpload());
      expect(result.current.isUploading).toBe(false);
    });
  });

  describe('concurrency guard', () => {
    it('returns inFlight=true when a second upload is attempted while one is in progress', async () => {
      // Never-resolving promise keeps the first upload stuck in flight.
      mockUpload.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useVerifiedMissionUpload());
      let secondResult: any;

      await act(async () => {
        // Start first upload — do NOT await, let it stay in flight.
        // inFlightRef.current is set to true synchronously before the first await.
        result.current.upload([validWaypoint()]);
        // Immediately attempt a second upload.
        secondResult = await result.current.upload([validWaypoint()]);
      });

      expect(secondResult.success).toBe(false);
      expect(secondResult.inFlight).toBe(true);
      // The second upload short-circuited — apiPost was only ever called by the first.
      expect(mockUpload).toHaveBeenCalledTimes(1);
    });
  });
});
