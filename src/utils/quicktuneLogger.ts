/**
 * QuickTune Logger
 *
 * Structured console logging for the entire QuickTune wizard flow.
 * All logs are prefixed with [QT:<STEP>] for easy filtering in Metro/Flipper.
 *
 * Usage:
 *   import { qtLog } from '../../../utils/quicktuneLogger';
 *   qtLog.info('Step3', 'Rover armed', { mode, groundspeed });
 *   qtLog.warn('Step3', 'Speed below threshold', { groundspeed, required: MIN_CIRCLE_SPEED_MS });
 *   qtLog.error('Step4', 'sendAuxFunction failed', err);
 *   qtLog.gate('Step3', 'canProceed', true, { isArmed, isCircleMode, groundSpeed });
 */

const PREFIX = '[QT]';

type StepTag =
  | 'Wizard'
  | 'Step1'
  | 'Step2'
  | 'Step3'
  | 'Step4'
  | 'Step5'
  | 'Step6'
  | 'Service'
  | 'Telemetry';

function fmt(step: StepTag, msg: string): string {
  return `${PREFIX}[${step}] ${msg}`;
}

export const qtLog = {
  info(step: StepTag, msg: string, data?: unknown): void {
    if (data !== undefined) {
      console.log(fmt(step, msg), data);
    } else {
      console.log(fmt(step, msg));
    }
  },

  warn(step: StepTag, msg: string, data?: unknown): void {
    if (data !== undefined) {
      console.warn(fmt(step, msg), data);
    } else {
      console.warn(fmt(step, msg));
    }
  },

  error(step: StepTag, msg: string, err?: unknown): void {
    if (err !== undefined) {
      console.error(fmt(step, msg), err);
    } else {
      console.error(fmt(step, msg));
    }
  },

  /** Log a boolean gate condition with all contributing fields */
  gate(step: StepTag, gateName: string, result: boolean, fields?: Record<string, unknown>): void {
    const icon = result ? '✅' : '❌';
    if (fields !== undefined) {
      console.log(fmt(step, `${icon} GATE [${gateName}] = ${result}`), fields);
    } else {
      console.log(fmt(step, `${icon} GATE [${gateName}] = ${result}`));
    }
  },

  /** Log a step transition */
  step(from: number, to: number): void {
    console.log(fmt('Wizard', `▶ Step ${from} → Step ${to}`));
  },

  /** Log an API call start */
  api(step: StepTag, method: string, endpoint: string, body?: unknown): void {
    if (body !== undefined) {
      console.log(fmt(step, `→ ${method} ${endpoint}`), body);
    } else {
      console.log(fmt(step, `→ ${method} ${endpoint}`));
    }
  },

  /** Log an API call result */
  apiResult(step: StepTag, endpoint: string, result: unknown): void {
    console.log(fmt(step, `← ${endpoint}`), result);
  },

  /** Log a socket event received */
  socket(step: StepTag, event: string, data: unknown): void {
    console.log(fmt(step, `⚡ socket:${event}`), data);
  },
};
