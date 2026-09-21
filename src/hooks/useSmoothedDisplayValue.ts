import { useEffect, useRef, useState } from 'react';

type SmoothingOptions = {
  /** Smaller values react faster; 220–350ms keeps live values responsive. */
  timeConstantMs?: number;
  /** Snap rather than animate implausibly large changes, such as a new GPS fix. */
  maxJump?: number;
  /** Stop requesting animation frames once the display is this close to its target. */
  settleEpsilon?: number;
  /** Interpolate using the shortest path around 0°/360°. */
  circular?: boolean;
};

const isFiniteValue = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeAngle = (value: number) => ((value % 360) + 360) % 360;

const shortestAngleDelta = (from: number, to: number) =>
  ((to - from + 540) % 360) - 180;

/**
 * Smooths a value for presentation only. The source telemetry remains untouched,
 * so this must never be used for navigation, mission decisions, or persistence.
 */
export function useSmoothedDisplayValue(
  value: number | null | undefined,
  {
    timeConstantMs = 260,
    maxJump = Number.POSITIVE_INFINITY,
    settleEpsilon = 0.01,
    circular = false,
  }: SmoothingOptions = {},
): number | null {
  const source = isFiniteValue(value)
    ? (circular ? normalizeAngle(value) : value)
    : null;
  const [displayValue, setDisplayValue] = useState<number | null>(source);
  const currentRef = useRef<number | null>(source);
  const targetRef = useRef<number | null>(source);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const optionsRef = useRef({ timeConstantMs, maxJump, settleEpsilon, circular });
  optionsRef.current = { timeConstantMs, maxJump, settleEpsilon, circular };

  useEffect(() => {
    const cancel = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    if (source === null) {
      cancel();
      currentRef.current = null;
      targetRef.current = null;
      lastFrameRef.current = null;
      setDisplayValue(null);
      return;
    }

    const current = currentRef.current;
    const delta =
      current === null
        ? 0
        : circular
          ? shortestAngleDelta(current, source)
          : source - current;

    targetRef.current = source;

    if (current === null || Math.abs(delta) > maxJump) {
      cancel();
      currentRef.current = source;
      lastFrameRef.current = null;
      setDisplayValue(source);
      return;
    }

    if (frameRef.current !== null) return;

    const animate = (frameTime: number) => {
      const currentValue = currentRef.current;
      const target = targetRef.current;
      const settings = optionsRef.current;

      if (currentValue === null || target === null) {
        frameRef.current = null;
        return;
      }

      const previousFrameTime = lastFrameRef.current ?? frameTime;
      const elapsed = Math.min(64, Math.max(0, frameTime - previousFrameTime));
      lastFrameRef.current = frameTime;
      const blend = 1 - Math.exp(-elapsed / Math.max(1, settings.timeConstantMs));
      const remaining = settings.circular
        ? shortestAngleDelta(currentValue, target)
        : target - currentValue;

      if (Math.abs(remaining) <= settings.settleEpsilon) {
        currentRef.current = target;
        setDisplayValue(target);
        frameRef.current = null;
        lastFrameRef.current = null;
        return;
      }

      const next = settings.circular
        ? normalizeAngle(currentValue + remaining * blend)
        : currentValue + remaining * blend;
      currentRef.current = next;
      setDisplayValue(next);
      frameRef.current = requestAnimationFrame(animate);
    };

    lastFrameRef.current = null;
    frameRef.current = requestAnimationFrame(animate);
  }, [source, circular, maxJump]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return displayValue;
}
