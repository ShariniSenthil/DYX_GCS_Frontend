/**
 * vehicleControlService — Arm / Disarm / MANUAL mode / E-Stop.
 *
 * Fixes the critical payload mismatches from the audit:
 *   - Arm: was `{ value: true }` → now `{ arm: true }`
 *   - E-stop fallback: was `/servo/emergency_stop` → now `/api/estop`
 *   - setMode restricted to 'MANUAL' only (OFFBOARD only via mission/start)
 *
 * All calls use apiClient with automatic token injection.
 */

import { apiPost } from './apiClient';
import { emit as socketEmit, on as socketOn, off as socketOff } from './socketClient';
import { PX4_VEHICLE, PX4_SOCKET_EVENTS } from '../config/px4Endpoints';
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
 * Trigger emergency stop via socket (primary) with REST fallback.
 *
 * PX4 sequence:
 *   1. Emit `emergency_stop` socket event
 *   2. Listen for `estop_result` event (not `emergency_stop_ack`)
 *   3. If socket not connected, fall back to POST /api/estop
 *
 * @param onResult Optional callback for estop_result socket event
 * @returns REST response if socket unavailable, otherwise undefined
 */
export async function emergencyStop(
  onResult?: EstopResultCallback,
): Promise<EstopResponse | undefined> {
  // Remove any previous listener to avoid duplicates
  socketOff(PX4_SOCKET_EVENTS.ESTOP_RESULT, 'vehicle-estop-result');

  // Register estop_result listener if callback provided
  if (onResult) {
    socketOn(
      PX4_SOCKET_EVENTS.ESTOP_RESULT,
      (data: unknown) => {
        const result = data as { success: boolean; message?: string };
        onResult(result);
        socketOff(PX4_SOCKET_EVENTS.ESTOP_RESULT, 'vehicle-estop-result');
      },
      'vehicle-estop-result',
    );
  }

  // Try socket path first
  try {
    socketEmit(PX4_SOCKET_EVENTS.EMERGENCY_STOP);
    // Socket emit succeeded — REST fallback not needed
    return undefined;
  } catch {
    // Socket not connected — fall back to REST
    console.warn('[vehicleControl] Socket e-stop failed, falling back to REST');
  }

  // REST fallback
  return apiPost<EstopResponse>(PX4_VEHICLE.ESTOP);
}

export const vehicleControlService = {
  armVehicle,
  disarmVehicle,
  setManualMode,
  emergencyStop,
};

export default vehicleControlService;
