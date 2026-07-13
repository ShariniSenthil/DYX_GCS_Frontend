/**
 * QuickTune Service Layer — NRP_ROS LEGACY DISABLED
 *
 * QuickTune (/api/quicktune/*) is not available on 4WD_SERVER.
 * All methods return a disabled error. UI entry points should be removed in Phase 10.
 */

const DISABLED_MSG = 'NRP_ROS QuickTune disabled — not available on 4WD_SERVER';

export interface ScriptCheckResponse {
  exists: boolean;
  name: string;
  size?: number;
  lastModified?: string;
}

export interface ScriptUploadResponse {
  success: boolean;
  message: string;
  scriptName: string;
  reboot_required?: boolean;
}

export interface AuxFunctionResponse {
  success: boolean;
  message: string;
  auxChannel: number;
  position?: number;
  auto_save_seconds?: number;
}

export interface QuickTuneStatusResponse {
  success: boolean;
  SCR_ENABLE: number | null;
  RTUN_ENABLE: number | null;
  RTUN_AUTO_SAVE: number | null;
  current_mode: string;
  reboot_required: boolean;
}

export interface RebootResponse {
  success: boolean;
  message: string;
}

export interface FlightModeResponse {
  success: boolean;
  message: string;
  mode: string;
}

export interface ArmResponse {
  success: boolean;
  message: string;
  armed: boolean;
}

function disabled<T>(): Promise<T> {
  return Promise.reject(new Error(DISABLED_MSG));
}

class QuickTuneService {
  // NRP_ROS LEGACY DISABLED — /api/quicktune/script
  async checkScript(): Promise<ScriptCheckResponse> {
    return disabled();
  }

  // NRP_ROS LEGACY DISABLED — /api/quicktune/script/upload
  async uploadScript(): Promise<ScriptUploadResponse> {
    return disabled();
  }

  async uploadScriptContent(_content: string, _name?: string): Promise<ScriptUploadResponse> {
    return disabled();
  }

  // NRP_ROS LEGACY DISABLED — /api/quicktune/aux_function
  async sendAuxFunction(
    _action: 'start' | 'stop' | 'save',
    _auxFunctionId?: number,
    _position?: number,
  ): Promise<AuxFunctionResponse> {
    return disabled();
  }

  async setFlightMode(_mode: string): Promise<FlightModeResponse> {
    return disabled();
  }

  async armRover(_arm?: boolean): Promise<ArmResponse> {
    return disabled();
  }

  // NRP_ROS LEGACY DISABLED — /api/quicktune/status
  async getStatus(): Promise<QuickTuneStatusResponse> {
    return disabled();
  }

  // NRP_ROS LEGACY DISABLED — /api/quicktune/reboot
  async rebootFC(): Promise<RebootResponse> {
    return disabled();
  }
}

export const quickTuneService = new QuickTuneService();
export default quickTuneService;