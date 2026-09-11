/**
 * After Start, ignore the previous run's canonical Mission Report so
 * terminal rows from the last complete cannot paint as the new run.
 */

export function shouldAcceptCanonicalReport(input: {
  incomingRunId: string | null | undefined;
  staleRunId: string | null | undefined;
  holdingForNewRun: boolean;
}): boolean {
  const incoming =
    typeof input.incomingRunId === "string" && input.incomingRunId.trim()
      ? input.incomingRunId.trim()
      : null;
  const stale =
    typeof input.staleRunId === "string" && input.staleRunId.trim()
      ? input.staleRunId.trim()
      : null;

  if (!input.holdingForNewRun) {
    return true;
  }

  if (stale && incoming === stale) {
    return false;
  }

  if (incoming && incoming !== stale) {
    return true;
  }

  return false;
}
