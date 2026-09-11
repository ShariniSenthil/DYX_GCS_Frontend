import React, { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";

import { useBackendMissionStatus } from "../../hooks/useBackendMissionStatus";
import { Toast } from "../shared/Toast";

const RECOVERY_NOTICE_MS = 4000;

/**
 * Global runtime RTK indication.
 *
 * Authoritative live source:
 *   Socket.IO mission_status / mission_progress
 *
 * Reconnect fallback:
 *   GET /api/mission/status through useBackendMissionStatus()
 *
 * Mission Manager policy:
 *   RUNNING + RTK FLOAT keeps moving. This UI only warns the operator.
 */
export const RtkRuntimeNotice: React.FC = () => {
  const { mission } = useBackendMissionStatus(true);
  const previousRtkStateRef = useRef<string | null>(null);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRecovered, setShowRecovered] = useState(false);

  const missionState = String(mission.state ?? "").trim().toUpperCase();
  const rtkState = String(mission.rtkState ?? "").trim().toUpperCase();

  const missionRunning = missionState === "RUNNING";
  const showFloatWarning = missionRunning && rtkState === "FLOAT";

  useEffect(() => {
    const previous = previousRtkStateRef.current;

    if (rtkState === "FLOAT") {
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      setShowRecovered(false);
    }

    if (
      missionRunning &&
      previous === "FLOAT" &&
      rtkState === "FIXED"
    ) {
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
      }

      setShowRecovered(true);

      recoveryTimerRef.current = setTimeout(() => {
        setShowRecovered(false);
        recoveryTimerRef.current = null;
      }, RECOVERY_NOTICE_MS);
    }

    previousRtkStateRef.current = rtkState || null;
  }, [missionRunning, rtkState]);

  useEffect(() => {
    return () => {
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <Toast
        visible={showFloatWarning}
        type="info"
        title="RTK FLOAT"
        message="Position accuracy degraded. Mission continuing."
        position="top"
        style={styles.floatWarning}
      />

      <Toast
        visible={showRecovered}
        type="success"
        title="RTK FIXED"
        message="RTK FIXED recovered. Mission continuing normally."
        position="top"
        style={styles.recovered}
      />
    </>
  );
};

const styles = StyleSheet.create({
  floatWarning: {
    top: 78,
    left: 180,
    right: 180,
    backgroundColor: "#B45309",
    borderColor: "#F59E0B",
    elevation: 10050,
    zIndex: 10050,
  },
  recovered: {
    top: 78,
    left: 180,
    right: 180,
    elevation: 10050,
    zIndex: 10050,
  },
});

export default RtkRuntimeNotice;
