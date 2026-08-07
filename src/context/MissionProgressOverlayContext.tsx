import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type MissionProgressPanelKey =
  | "robotStatus"
  | "missionProgress"
  | "distanceToTarget"
  | "accuracyMonitor"
  | "systemStatus"
  | "missionControls"
  | "bottom";

export interface MissionProgressPanelVisibility {
  robotStatus: boolean;
  missionProgress: boolean;
  distanceToTarget: boolean;
  accuracyMonitor: boolean;
  systemStatus: boolean;
  missionControls: boolean;
  bottom: boolean;
}

const DEFAULT_PANEL_VISIBILITY: MissionProgressPanelVisibility = {
  robotStatus: true,
  missionProgress: true,
  distanceToTarget: true,
  accuracyMonitor: true,
  systemStatus: true,
  missionControls: true,
  bottom: true,
};

interface MissionProgressOverlayContextValue {
  isWidgetMenuOpen: boolean;
  setIsWidgetMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggleWidgetMenu: () => void;
  panelVisibility: MissionProgressPanelVisibility;
  setPanelVisibility: React.Dispatch<
    React.SetStateAction<MissionProgressPanelVisibility>
  >;
  togglePanel: (key: MissionProgressPanelKey) => void;
  setPanelVisible: (key: MissionProgressPanelKey, visible: boolean) => void;
}

const MissionProgressOverlayContext =
  createContext<MissionProgressOverlayContextValue | null>(null);

export function MissionProgressOverlayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isWidgetMenuOpen, setIsWidgetMenuOpen] = useState(false);
  const [panelVisibility, setPanelVisibility] =
    useState<MissionProgressPanelVisibility>(DEFAULT_PANEL_VISIBILITY);

  const toggleWidgetMenu = useCallback(() => {
    setIsWidgetMenuOpen((open) => !open);
  }, []);

  const togglePanel = useCallback((key: MissionProgressPanelKey) => {
    setPanelVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setPanelVisible = useCallback(
    (key: MissionProgressPanelKey, visible: boolean) => {
      setPanelVisibility((prev) => ({ ...prev, [key]: visible }));
    },
    [],
  );

  const value = useMemo(
    () => ({
      isWidgetMenuOpen,
      setIsWidgetMenuOpen,
      toggleWidgetMenu,
      panelVisibility,
      setPanelVisibility,
      togglePanel,
      setPanelVisible,
    }),
    [
      isWidgetMenuOpen,
      panelVisibility,
      togglePanel,
      setPanelVisible,
      toggleWidgetMenu,
    ],
  );

  return (
    <MissionProgressOverlayContext.Provider value={value}>
      {children}
    </MissionProgressOverlayContext.Provider>
  );
}

export function useMissionProgressOverlay() {
  const ctx = useContext(MissionProgressOverlayContext);
  if (!ctx) {
    throw new Error(
      "useMissionProgressOverlay must be used within MissionProgressOverlayProvider",
    );
  }
  return ctx;
}

export function useMissionProgressOverlayOptional() {
  return useContext(MissionProgressOverlayContext);
}

/** Map legacy persisted UI flags to the split-panel model. */
export function migrateLegacyPanelVisibility(uiState: {
  isLeftPanelVisible?: boolean;
  isRightPanelVisible?: boolean;
  isRobotStatusVisible?: boolean;
  isMissionProgressVisible?: boolean;
  isDistanceToTargetVisible?: boolean;
  isAccuracyMonitorVisible?: boolean;
  isSystemStatusVisible?: boolean;
  isMissionControlsVisible?: boolean;
  isBottomTableVisible?: boolean;
}): Partial<MissionProgressPanelVisibility> {
  const next: Partial<MissionProgressPanelVisibility> = {};

  if (uiState.isRobotStatusVisible !== undefined) {
    next.robotStatus = uiState.isRobotStatusVisible;
  }
  if (uiState.isMissionProgressVisible !== undefined) {
    next.missionProgress = uiState.isMissionProgressVisible;
  }
  if (uiState.isDistanceToTargetVisible !== undefined) {
    next.distanceToTarget = uiState.isDistanceToTargetVisible;
  }
  if (uiState.isAccuracyMonitorVisible !== undefined) {
    next.accuracyMonitor = uiState.isAccuracyMonitorVisible;
  }
  if (uiState.isSystemStatusVisible !== undefined) {
    next.systemStatus = uiState.isSystemStatusVisible;
  }
  if (uiState.isMissionControlsVisible !== undefined) {
    next.missionControls = uiState.isMissionControlsVisible;
  }
  if (uiState.isBottomTableVisible !== undefined) {
    next.bottom = uiState.isBottomTableVisible;
  }

  if (uiState.isLeftPanelVisible !== undefined) {
    next.robotStatus = uiState.isLeftPanelVisible;
    next.missionProgress = uiState.isLeftPanelVisible;
    next.distanceToTarget = uiState.isLeftPanelVisible;
    next.accuracyMonitor = uiState.isLeftPanelVisible;
  }
  if (uiState.isRightPanelVisible !== undefined) {
    next.systemStatus = uiState.isRightPanelVisible;
    next.missionControls = uiState.isRightPanelVisible;
  }

  return next;
}
