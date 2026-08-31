/**
 * vehicleControlService — Arm / Disarm / MANUAL mode / E-Stop.
 *
 * Command transport contracts:
 *   - Arm uses `{ arm: true }`.
 *   - E-stop uses acknowledged `POST /api/estop`.
 *   - setMode is restricted to MANUAL (OFFBOARD only via mission/start).
 *
 * All calls use apiClient with automatic token injection.
 */

import { apiPost } from './apiClient';
import { PX4_VEHICLE } from '../config/px4Endpoints';
import type {
  ArmRequest,
  ArmResponse,
  SetModeRequest,
  SetModeResponse,
  EstopResponse,
} from '../types/px4/mission';

// ── Arm / Disarm ──────────────────────────────────────────────────────────────

/**
 * Arm the vehicle.
 * Backend arms the FCU and activates spray safety checks.
 *
 * IMPORTANT: Do NOT optimistically set `armed=true` locally.
 *   Wait for telemetry `armed: true` from the socket.
 */
export async function armVehicle(): Promise<ArmResponse> {
  return apiPost<ArmResponse>(PX4_VEHICLE.ARM, { arm: true } satisfies ArmRequest);
}

/**
 * Disarm the vehicle.
 * Response includes `spray_off_confirmed` — wait for it before updating UI.
 */
export async function disarmVehicle(): Promise<ArmResponse> {
  return apiPost<ArmResponse>(PX4_VEHICLE.ARM, { arm: false } satisfies ArmRequest);
}

// ── Mode control ──────────────────────────────────────────────────────────────

/**
 * Switch to MANUAL mode.
 * This is the only mode that can be set via REST.
 * OFFBOARD is only entered via POST /api/mission/start.
 */
export async function setManualMode(): Promise<SetModeResponse> {
  return apiPost<SetModeResponse>(
    PX4_VEHICLE.SET_MODE,
    { mode: 'MANUAL' } satisfies SetModeRequest,
  );
}

// ── Emergency stop ────────────────────────────────────────────────────────────

type EstopResultCallback = (result: { success: boolean; message?: string }) => void;

/**
 * Trigger emergency stop through the acknowledged REST authority.
 *
 * @param onResult Optional callback invoked from the REST response
 * @returns The backend acknowledgement
 */
export async function emergencyStop(
  onResult?: EstopResultCallback,
): Promise<EstopResponse> {
  const response = await apiPost<EstopResponse>(PX4_VEHICLE.ESTOP);

  if (onResult) {
    onResult({
      success: response.success,
      message: response.message,
    });
  }

  return response;
}

export const vehicleControlService = {
  armVehicle,
  disarmVehicle,
  setManualMode,
  emergencyStop,
};

export default vehicleControlService;
