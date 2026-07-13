export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function processAxis(
  value: number,
  deadZone = 0.05,
  curve = 1,
  maxAbs = 1,
): number {
  const clamped = clamp(value, -1, 1);
  const abs = Math.abs(clamped);
  if (abs <= deadZone) return 0;

  const normalized = (abs - deadZone) / (1 - deadZone);
  const shaped = Math.pow(normalized, Math.max(0.1, curve));
  return clamp(Math.sign(clamped) * shaped * maxAbs, -maxAbs, maxAbs);
}

export function processJoystickPoint(
  x: number,
  y: number,
  maxThrottle = 1,
  maxSteering = 1,
): { throttle: number; steering: number; knobX: number; knobY: number } {
  const radius = Math.hypot(x, y);
  const scale = radius > 1 ? 1 / radius : 1;
  const normalizedX = x * scale;
  const normalizedY = y * scale;

  return {
    throttle: processAxis(-normalizedY, 0.06, 1.15, maxThrottle),
    steering: processAxis(normalizedX, 0.06, 1.15, maxSteering),
    knobX: normalizedX,
    knobY: normalizedY,
  };
}
