import {
  PX4_SPRAY,
} from "../config/px4Endpoints";

import {
  apiGet,
  apiPost,
} from "./apiClient";


export interface SprayConfig {
  available: boolean;

  status_age_sec?: number | null;

  press_pwm_us: number | null;
  release_pwm_us: number | null;

  press_value?: number | null;
  release_value?: number | null;

  spray_duration_sec?: number | null;

  controller_state?: string | null;

  ready?: boolean;

  fault_latched?: boolean;
  fault_reason?: string | null;

  config_request_id?: string | null;
  config_result?: string | null;
  config_reason?: string | null;

  pwm_min_us?: number;
  pwm_max_us?: number;
}


export interface SprayConfigResponse {
  success: boolean;

  message?: string;

  config: SprayConfig;
}


export interface SetSprayConfigRequest {
  press_pwm_us: number;
  release_pwm_us: number;
}


function validatePwm(
  value: number,
  name: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `${name} must be a valid number.`,
    );
  }

  if (
    value < 1000 ||
    value > 2000
  ) {
    throw new Error(
      `${name} must be between 1000 and 2000 µs.`,
    );
  }
}


export async function getSprayConfig():
Promise<SprayConfigResponse> {
  return apiGet<SprayConfigResponse>(
    PX4_SPRAY.CONFIG,
  );
}


export async function setSprayConfig(
  request: SetSprayConfigRequest,
): Promise<SprayConfigResponse> {
  validatePwm(
    request.press_pwm_us,
    "Press PWM",
  );

  validatePwm(
    request.release_pwm_us,
    "Release PWM",
  );

  return apiPost<SprayConfigResponse>(
    PX4_SPRAY.CONFIG,
    {
      press_pwm_us:
        request.press_pwm_us,

      release_pwm_us:
        request.release_pwm_us,
    },
  );
}


export default {
  getSprayConfig,
  setSprayConfig,
};