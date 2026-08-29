/**
 * Screen-local RTK control lifecycle.
 *
 * Polls GET /api/rtk/status every 3 seconds only while the shared RTK UI is
 * visible. One in-flight poll at a time. Mutations are exclusive. Stale async
 * completions after close/unmount are ignored.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  toRtkControlView,
  unwrapRtkStatus,
  type RtkControlViewModel,
} from "../adapters/rtkControlAdapter";
import {
  activateRtkProfile,
  clearActiveRtkProfile,
  createRtkProfile,
  deleteRtkProfile,
  formatRtkApiError,
  getRtkStatus,
  listRtkProfiles,
  parseRtkApiError,
  startRtk,
  stopRtk,
  updateRtkProfile,
} from "../services/rtkService";
import type {
  RtkIntentResponse,
  RtkParsedApiError,
  RtkProfile,
  RtkProfileCreateRequest,
  RtkProfileUpdateRequest,
  RtkStatusResponse,
} from "../types/rtk";

export const RTK_STATUS_POLL_MS = 3000;

export interface UseRtkControlOptions {
  visible: boolean;
  connected?: boolean;
}

export interface RtkMutationResult<T> {
  ok: true;
  value: T;
}

export interface RtkMutationFailure {
  ok: false;
  error: RtkParsedApiError;
}

export type RtkMutationOutcome<T> = RtkMutationResult<T> | RtkMutationFailure;

export interface UseRtkControlResult {
  profiles: RtkProfile[];
  selectedProfileId: number | null;
  selectedProfile: RtkProfile | null;
  activeProfile: RtkProfile | null;
  status: RtkStatusResponse | null;
  view: RtkControlViewModel;
  initialLoading: boolean;
  refreshing: boolean;
  mutationBusy: boolean;
  error: RtkParsedApiError | null;
  canStart: boolean;
  canStop: boolean;
  canEdit: boolean;
  canDelete: boolean;
  disabledReason: string | null;
  selectProfile: (id: number | null) => void;
  refresh: () => Promise<void>;
  createProfile: (
    dto: RtkProfileCreateRequest,
  ) => Promise<RtkMutationOutcome<RtkProfile>>;
  updateProfile: (
    id: number,
    dto: RtkProfileUpdateRequest,
  ) => Promise<RtkMutationOutcome<RtkProfile>>;
  removeProfile: (id: number) => Promise<RtkMutationOutcome<true>>;
  activateProfile: (id: number) => Promise<RtkMutationOutcome<true>>;
  clearActive: () => Promise<RtkMutationOutcome<true>>;
  start: () => Promise<RtkMutationOutcome<RtkIntentResponse>>;
  stop: () => Promise<RtkMutationOutcome<RtkIntentResponse>>;
}

function fail(error: unknown, fallback: string): RtkMutationFailure {
  const parsed = parseRtkApiError(error);
  return {
    ok: false,
    error: {
      ...parsed,
      message: parsed.message || fallback,
    },
  };
}

export function useRtkControl(
  options: UseRtkControlOptions,
): UseRtkControlResult {
  const visible = options.visible;
  const connected = options.connected !== false;

  const [profiles, setProfiles] = useState<RtkProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [status, setStatus] = useState<RtkStatusResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [error, setError] = useState<RtkParsedApiError | null>(null);

  const generationRef = useRef(0);
  const visibleRef = useRef(visible);
  const connectedRef = useRef(connected);
  const mountedRef = useRef(true);
  const statusRequestPromiseRef = useRef<Promise<void> | null>(null);
  const mutationBusyRef = useRef(false);
  const latestStatusRequestRef = useRef(0);
  const latestProfilesRequestRef = useRef(0);

  visibleRef.current = visible;
  connectedRef.current = connected;
  mutationBusyRef.current = mutationBusy;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyIfCurrent = useCallback((generation: number): boolean => {
    return visibleRef.current && generation === generationRef.current;
  }, []);

  const loadStatus = useCallback(
    async (
      generation: number,
      forceAfterCurrent = false,
    ): Promise<void> => {
      const existing = statusRequestPromiseRef.current;

      if (existing) {
        await existing;

        if (!forceAfterCurrent || !applyIfCurrent(generation)) {
          return;
        }
      }

      // Another waiter may have started the next request while this caller
      // was awaiting the previous one. Reuse it rather than overlapping.
      if (statusRequestPromiseRef.current) {
        await statusRequestPromiseRef.current;
        return;
      }

      const requestId = ++latestStatusRequestRef.current;

      const request = (async () => {
        try {
          const next = await getRtkStatus();

          if (
            !applyIfCurrent(generation) ||
            requestId !== latestStatusRequestRef.current
          ) {
            return;
          }

          setStatus(next);
        } catch (loadError) {
          if (
            !applyIfCurrent(generation) ||
            requestId !== latestStatusRequestRef.current
          ) {
            return;
          }

          setError(parseRtkApiError(loadError));
        }
      })();

      let tracked: Promise<void>;

      tracked = request.finally(() => {
        if (statusRequestPromiseRef.current === tracked) {
          statusRequestPromiseRef.current = null;
        }
      });

      statusRequestPromiseRef.current = tracked;
      await tracked;
    },
    [applyIfCurrent],
  );

  const loadProfiles = useCallback(async (generation: number): Promise<void> => {
    const requestId = ++latestProfilesRequestRef.current;
    try {
      const result = await listRtkProfiles();
      if (!applyIfCurrent(generation) || requestId !== latestProfilesRequestRef.current) {
        return;
      }
      setProfiles(result.profiles);
      setSelectedProfileId((current) => {
        if (
          current != null &&
          result.profiles.some((profile) => profile.id === current)
        ) {
          return current;
        }

        return null;
      });
    } catch (loadError) {
      if (!applyIfCurrent(generation) || requestId !== latestProfilesRequestRef.current) {
        return;
      }
      setError(parseRtkApiError(loadError));
    }
  }, [applyIfCurrent]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!visibleRef.current || !connectedRef.current) {
      return;
    }

    const generation = generationRef.current;
    setRefreshing(true);

    try {
      await Promise.all([
        loadProfiles(generation),
        loadStatus(generation, true),
      ]);
    } finally {
      if (applyIfCurrent(generation)) {
        setRefreshing(false);
        setInitialLoading(false);
      }
    }
  }, [applyIfCurrent, loadProfiles, loadStatus]);

  useEffect(() => {
    if (!visible || !connected) {
      if (visible && !connected) {
        setInitialLoading(false);
        setRefreshing(false);
      }
      return undefined;
    }

    const generation = ++generationRef.current;
    setInitialLoading(true);
    setError(null);
    void refresh();

    const timer = setInterval(() => {
      if (!visibleRef.current || !connectedRef.current) {
        return;
      }

      void loadStatus(generation);
    }, RTK_STATUS_POLL_MS);

    return () => {
      generationRef.current += 1;
      clearInterval(timer);
    };
  }, [connected, visible, loadStatus, refresh]);

  useEffect(() => {
    const unwrapped = unwrapRtkStatus(status);
    if (!unwrapped) {
      return;
    }
    const activeId = unwrapped.persisted?.active_profile_id ?? null;
    setSelectedProfileId((current) => {
      if (current != null) {
        return current;
      }
      return activeId;
    });
  }, [status]);

  const runMutation = useCallback(
    async <T,>(
      operation: () => Promise<T>,
      fallback: string,
    ): Promise<RtkMutationOutcome<T>> => {
      if (!visibleRef.current || !connectedRef.current) {
        return {
          ok: false,
          error: {
            statusCode: null,
            code: "NETWORK",
            message: "Rover Offline",
          },
        };
      }

      if (mutationBusyRef.current) {
        return {
          ok: false,
          error: {
            statusCode: null,
            code: "RTK_BUSY",
            message: "Another RTK command is already in progress",
          },
        };
      }

      mutationBusyRef.current = true;
      setMutationBusy(true);
      setError(null);

      try {
        const value = await operation();
        await refresh();
        return { ok: true, value };
      } catch (mutationError) {
        const failed = fail(mutationError, fallback);
        if (visibleRef.current) {
          setError(failed.error);
        }
        await refresh();
        return failed;
      } finally {
        mutationBusyRef.current = false;

        // The shared RTK screen remains mounted while its Modal is hidden.
        // Reset this bookkeeping even if the operator closes the screen
        // before the network mutation completes. Avoid setState only after
        // an actual component unmount.
        if (mountedRef.current) {
          setMutationBusy(false);
        }
      }
    },
    [refresh],
  );

  const createProfile = useCallback(
    (dto: RtkProfileCreateRequest) =>
      runMutation(async () => {
        const profile = await createRtkProfile(dto);
        if (visibleRef.current) {
          setSelectedProfileId(profile.id);
        }
        return profile;
      }, "Unable to create RTK profile"),
    [runMutation],
  );

  const updateSelected = useCallback(
    (id: number, dto: RtkProfileUpdateRequest) =>
      runMutation(async () => {
        const profile = await updateRtkProfile(id, dto);
        if (visibleRef.current) {
          setSelectedProfileId(profile.id);
        }
        return profile;
      }, "Unable to update RTK profile"),
    [runMutation],
  );

  const removeProfile = useCallback(
    (id: number) =>
      runMutation(async () => {
        await deleteRtkProfile(id);
        if (visibleRef.current) {
          setSelectedProfileId((current) =>
            current === id ? null : current,
          );
        }
        return true as const;
      }, "Unable to delete RTK profile"),
    [runMutation],
  );

  const activateProfile = useCallback(
    (id: number) =>
      runMutation(async () => {
        await activateRtkProfile(id);
        return true as const;
      }, "Unable to activate RTK profile"),
    [runMutation],
  );

  const clearActive = useCallback(
    () =>
      runMutation(async () => {
        await clearActiveRtkProfile();
        return true as const;
      }, "Unable to clear the active RTK profile"),
    [runMutation],
  );

  const start = useCallback(
    () =>
      runMutation(async () => {
        const intent = await startRtk();
        if (visibleRef.current) {
          setStatus((previous) => {
            if (!previous) {
              return previous;
            }
            const unwrapped = unwrapRtkStatus(previous);
            if (!unwrapped) {
              return previous;
            }
            return {
              status: {
                ...unwrapped,
                persisted: intent.persisted,
              },
            };
          });
        }
        return intent;
      }, "Unable to start RTK"),
    [runMutation],
  );

  const stop = useCallback(
    () =>
      runMutation(async () => {
        const intent = await stopRtk();
        if (visibleRef.current) {
          setStatus((previous) => {
            if (!previous) {
              return previous;
            }
            const unwrapped = unwrapRtkStatus(previous);
            if (!unwrapped) {
              return previous;
            }
            return {
              status: {
                ...unwrapped,
                persisted: intent.persisted,
              },
            };
          });
        }
        return intent;
      }, "Unable to stop RTK"),
    [runMutation],
  );

  const view = useMemo(
    () =>
      toRtkControlView(status, {
        connected,
        mutationBusy,
      }),
    [connected, mutationBusy, status],
  );

  const unwrappedStatus = unwrapRtkStatus(status);
  const activeProfileId =
    unwrappedStatus?.persisted?.active_profile_id ??
    view.activeProfileId ??
    null;

  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ??
    unwrappedStatus?.active_profile ??
    view.activeProfile ??
    null;

  return {
    profiles,
    selectedProfileId,
    selectedProfile,
    activeProfile,
    status,
    view,
    initialLoading,
    refreshing,
    mutationBusy,
    error,
    canStart: view.canStart,
    canStop: view.canStop,
    canEdit: view.canEdit,
    canDelete:
      view.canDelete &&
      selectedProfile != null &&
      selectedProfile.id !== activeProfileId,
    disabledReason: view.disabledReason ?? (error ? error.message : null),
    selectProfile: setSelectedProfileId,
    refresh,
    createProfile,
    updateProfile: updateSelected,
    removeProfile,
    activateProfile,
    clearActive,
    start,
    stop,
  };
}

export function rtkErrorMessage(error: unknown, fallback: string): string {
  return formatRtkApiError(error, fallback);
}
