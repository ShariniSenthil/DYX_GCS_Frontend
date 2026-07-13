/**
 * Mission Mode Service
 *
 * Legacy: POST /api/mission/mode (ArduRover backend)
 * PX4:    Delegates to sprayModeService (PUT /api/path/{name}/spray-mode/*)
 *
 * When ROVER_ENABLED=true, setMissionMode maps the legacy mode names
 * to the appropriate spray-mode sidecar call. pathName must be provided.
 */

import { getBackendURL } from '../config';
import { SPRAY_MODE_SIDECAR_ENABLED } from '../config/featureFlags';
import { setSprayMode, uiModeToSprayType } from './sprayModeService';
import type { SprayModeResponse } from '../types/px4/sprayMode';

export interface MissionModeConfig {
    mode: 'auto' | 'manual' | 'continuous' | 'dash';
    dash_servo_on_time?: number;
    dash_servo_off_time?: number;
    /** PX4 only: required path name for spray-mode sidecar. */
    pathName?: string;
    /** PX4 Dash: on run meters (replaces dash_servo_on_time). */
    dash_on_run_m?: number;
    /** PX4 Dash: off gap meters (replaces dash_servo_off_time). */
    dash_off_gap_m?: number;
}

export interface MissionModeResponse {
    success: boolean;
    message?: string;
    current_mode?: string;
    config?: {
        dash_servo_on_time?: number;
        dash_servo_off_time?: number;
    };
    error?: string;
}

/**
 * Set the mission mode.
 *
 * PX4 mode: delegates to sprayModeService PUT call. Requires `pathName`.
 * Legacy mode: POST /api/mission/mode (unchanged).
 */
export const setMissionMode = async (config: MissionModeConfig): Promise<MissionModeResponse> => {
    // PX4 path: delegate to spray mode sidecar
    if (SPRAY_MODE_SIDECAR_ENABLED) {
        if (!config.pathName) {
            return {
                success: false,
                error: 'pathName required for PX4 spray mode sidecar',
            };
        }
        try {
            const sprayType = uiModeToSprayType(config.mode);
            let sprayConfig: Record<string, unknown> = {};

            if (sprayType === 'dash') {
                sprayConfig = {
                    dash_on_run_m: config.dash_on_run_m ?? 1.0,
                    dash_off_gap_m: config.dash_off_gap_m ?? 1.0,
                };
            }

            const result: SprayModeResponse = await setSprayMode(config.pathName, sprayType, sprayConfig as any);
            return {
                success: true,
                current_mode: result.mode ?? config.mode,
                message: `Spray mode set to ${result.mode}`,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to set spray mode',
            };
        }
    }

    // NRP_ROS LEGACY DISABLED — POST /api/mission/mode
    return {
        success: false,
        error: 'NRP_ROS legacy disabled — use sprayModeService (4WD_SERVER)',
    };
};

/**
 * Get the current mission mode.
 * PX4: Not directly applicable (read from mission status instead).
 */
export const getMissionMode = async (pathName?: string): Promise<MissionModeResponse> => {
    if (SPRAY_MODE_SIDECAR_ENABLED) {
        if (!pathName) {
            return { success: true, current_mode: 'unknown' };
        }
        try {
            const { getSprayMode } = await import('./sprayModeService');
            const result = await getSprayMode(pathName);
            return {
                success: true,
                current_mode: result.mode ?? 'none',
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get spray mode',
            };
        }
    }

    // NRP_ROS LEGACY DISABLED — GET /api/mission/mode
    return {
        success: false,
        error: 'NRP_ROS legacy disabled — use sprayModeService (4WD_SERVER)',
    };
};

export default {
    setMissionMode,
    getMissionMode,
};
