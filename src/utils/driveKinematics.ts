/**
 * driveKinematics — Tank → normalized throttle/steering conversion.
 *
 * The UI provides left/right track values (arbitrary range, e.g. [-100, 100]).
 * PX4 joystick expects normalized throttle ∈ [-1, 1] and steering ∈ [-1, 1].
 *
 * Conversion:
 *   throttle = (left + right) / 2  →  normalized [-1, 1]
 *   steering = (right - left) / 2  →  normalized [-1, 1]
 *
 * Both outputs are clamped to [-1, 1].
 */

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Convert tank-drive (left/right track) values to normalized throttle/steering.
 *
 * @param left  Left track value (any range, e.g. -100 to 100)
 * @param right Right track value (same range as left)
 * @param maxInput Maximum absolute input value (defaults to 1.0 for pre-normalized inputs)
 *
 * @returns { throttle, steering } both clamped to [-1, 1]
 */
export function tankToThrottleSteering(
  left: number,
  right: number,
  maxInput = 1.0,
): { throttle: number; steering: number } {
  if (maxInput === 0) return { throttle: 0, steering: 0 };

  const leftN = clamp(left / maxInput, -1, 1);
  const rightN = clamp(right / maxInput, -1, 1);

  const throttle = clamp((leftN + rightN) / 2, -1, 1);
  const steering = clamp((rightN - leftN) / 2, -1, 1);

  return { throttle, steering };
}

/**
 * Apply dead zone: values within `threshold` of zero are snapped to zero.
 * Prevents micro-drift when joystick is at rest.
 */
export function applyDeadZone(value: number, threshold = 0.05): number {
  return Math.abs(value) < threshold ? 0 : value;
}

/**
 * Convenience: tank → throttle/steering with dead zone applied to both inputs.
 */
export function tankToThrottleSteeringWithDeadZone(
  left: number,
  right: number,
  maxInput = 1.0,
  deadZone = 0.05,
): { throttle: number; steering: number } {
  return tankToThrottleSteering(
    applyDeadZone(left, deadZone * maxInput),
    applyDeadZone(right, deadZone * maxInput),
    maxInput,
  );
}

/**
 * Normalize a single [-maxInput, maxInput] value to [-1, 1].
 */
export function normalizeAxis(value: number, maxInput = 100): number {
  if (maxInput === 0) return 0;
  return clamp(value / maxInput, -1, 1);
}
