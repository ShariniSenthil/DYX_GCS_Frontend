import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/colors";
import { useRover } from "../context/RoverContext";
import { FailsafeModeSelector } from "../components/pathplan/FailsafeModeSelector";
import { ServoConfigModal } from "../components/settings/ServoConfigModal";
import { ParamBrowserModal } from "../components/settings/ParamBrowserModal";
import { NTRIPProfile } from "../types/ntrip";
import { NTRIPProfileList } from "../components/missionreport/NTRIPProfileList";
import { NTRIPProfileEditor } from "../components/missionreport/NTRIPProfileEditor";
import {
  getRtkStatus,
  startLoraStream,
  startNtripStream,
  stopAllRtk,
  stopLoraStream,
  type RtkStatusResponse,
} from "../services/rtkService";
import { useAuth } from "../hooks/useAuth";

interface SettingsScreenProps {
  visible: boolean;
  onClose: () => void;
}

const getRtkFailureMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error) {
    const responseBody =
      "responseBody" in err
        ? String((err as { responseBody?: unknown }).responseBody ?? "")
        : "";
    if (responseBody) {
      try {
        const parsed = JSON.parse(responseBody);
        const detail = parsed?.detail;
        if (typeof detail === "string") {
          return `${err.message}: ${detail}`;
        }
      } catch {
        return `${err.message}: ${responseBody}`;
      }
    }
    return err.message;
  }
  return fallback;
};

const SettingsScreenComponent: React.FC<SettingsScreenProps> = ({
  visible,
  onClose,
}) => {
  const { logout, session } = useAuth();

  const {
    gpsFailsafeMode,
    setGpsFailsafeMode,
    telemetry,
    services,
    connectionState,
    onMissionEvent,
  } = useRover();
  const [showFailsafeSelector, setShowFailsafeSelector] = useState(false);

  // TTS State
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsLanguage, setTtsLanguage] = useState<"en" | "ta" | "hi">("en");
  const [ttsGender, setTtsGender] = useState<"male" | "female">("male");
  const [isLoadingTTS, setIsLoadingTTS] = useState(false);

  // Obstacle Detection State
  const [obstacleDetectionEnabled, setObstacleDetectionEnabled] =
    useState(false);
  const [isLoadingObstacle, setIsLoadingObstacle] = useState(false);
  const [lastObstacleUpdate, setLastObstacleUpdate] = useState<string>("");

  // Servo Configuration State
  const [servoEnabled, setServoEnabled] = useState(false);
  const [servoChannel, setServoChannel] = useState(9);
  const [servoPwmOn, setServoPwmOn] = useState(2300);
  const [servoPwmOff, setServoPwmOff] = useState(1750);
  const [servoDelayBefore, setServoDelayBefore] = useState(0.0);
  const [servoSprayDuration, setServoSprayDuration] = useState(5.0);
  const [servoDelayAfter, setServoDelayAfter] = useState(0.0);
  const [isLoadingServo, setIsLoadingServo] = useState(false);
  const [servoConfigLoaded, setServoConfigLoaded] = useState(false);
  const [showServoConfigModal, setShowServoConfigModal] = useState(false);
  const [isLoadingServoModal, setIsLoadingServoModal] = useState(false);

  // LED Controller State
  const [ledEnabled, setLedEnabled] = useState(false);
  const [isLoadingLed, setIsLoadingLed] = useState(false);
  const [lastLedUpdate, setLastLedUpdate] = useState<string>("");

  // RTK Injection State
  const [showRTKModal, setShowRTKModal] = useState(false);
  const [modalScreen, setModalScreen] = useState<"list" | "editor">("list");
  const [selectedProfile, setSelectedProfile] = useState<NTRIPProfile | null>(
    null,
  );
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isRTKStreamRunning, setIsRTKStreamRunning] = useState(false);
  const [rtkTotalBytes, setRtkTotalBytes] = useState(0);
  const [isRTKSubmitting, setIsRTKSubmitting] = useState(false);
  const [rtkFeedback, setRtkFeedback] = useState<string | null>(null);
  const [rtkError, setRtkError] = useState<string | null>(null);
  const [rtkHealthy, setRtkHealthy] = useState(false);
  const [rtkActiveSource, setRtkActiveSource] = useState<string | null>(null);
  const [rtkStatusMessage, setRtkStatusMessage] = useState("Idle");
  const rtkMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // LoRa RTK State

  // MAVLink Param Browser State
  const [showParamBrowser, setShowParamBrowser] = useState(false);
  const [rtkSource, setRtkSource] = useState<"ntrip" | "lora">("ntrip");
  const [loraRunning, setLoraRunning] = useState(false);
  const [loraConnected, setLoraConnected] = useState(false);
  const [loraSerialPort, setLoraSerialPort] = useState("/dev/ttyUSB0");
  const [loraBaudrate, setLoraBaudrate] = useState("115200");
  const [loraFeedback, setLoraFeedback] = useState<string | null>(null);
  const [loraError, setLoraError] = useState<string | null>(null);

  // Toast/Success Message State
  const [successMessage, setSuccessMessage] = useState<string>("");

  // RTK Monitor Functions
  const stopRTKMonitor = useCallback(() => {
    if (rtkMonitorRef.current) {
      clearInterval(rtkMonitorRef.current);
      rtkMonitorRef.current = null;
    }
  }, []);

  const applyRtkStatus = useCallback((status: RtkStatusResponse) => {
    const source = (
      status.active_source ??
      status.source ??
      status.mode ??
      ""
    ).toLowerCase();
    const running = Boolean(status.running ?? status.active);
    const healthy = Boolean(
      status.stream_healthy ?? status.healthy ?? status.connected,
    );
    const bytesReceived = status.bytes_received ?? 0;
    const sourceIsLora =
      running && (source.includes("lora") || Boolean(status.serial_open));
    const sourceIsNtrip = running && !sourceIsLora;
    const sourceLabel =
      status.active_source ?? status.source ?? status.mode ?? null;

    setRtkTotalBytes(bytesReceived);
    setRtkHealthy(healthy);
    setRtkActiveSource(sourceLabel);
    setIsRTKStreamRunning(sourceIsNtrip);
    setLoraRunning(sourceIsLora);
    setLoraConnected(sourceIsLora && (Boolean(status.serial_open) || healthy));

    if (!running) {
      setRtkStatusMessage("Idle");
      return false;
    }

    const age = status.last_valid_rtcm_age_s ?? status.last_frame_age_s;
    const ageLabel =
      typeof age === "number" ? ` • RTCM age ${age.toFixed(1)}s` : "";
    setRtkStatusMessage(`${healthy ? "Healthy" : "Running"}${ageLabel}`);
    return true;
  }, []);

  const startRTKMonitor = useCallback(() => {
    if (rtkMonitorRef.current) return;
    rtkMonitorRef.current = setInterval(async () => {
      try {
        const rtkStatus = await getRtkStatus();
        const running = applyRtkStatus(rtkStatus);
        if (!running) {
          stopRTKMonitor();
        }
      } catch (e) {
        console.error("RTK monitor error:", e);
      }
    }, 250);
  }, [applyRtkStatus, stopRTKMonitor]);

  // Check RTK status on component mount and modal open
  useEffect(() => {
    if (visible) {
      const checkRTKStatus = async () => {
        try {
          const rtkStatus = await getRtkStatus();
          const running = applyRtkStatus(rtkStatus);
          if (running) {
            startRTKMonitor();
          }
        } catch (err) {
          console.error("Failed to get initial RTK status:", err);
        }
      };
      checkRTKStatus();
    }
    return () => {
      stopRTKMonitor();
    };
  }, [visible, applyRtkStatus, startRTKMonitor, stopRTKMonitor]);

  // RTK Button Handlers
  const handleOpenRTKModal = () => {
    setModalScreen("list");
    setSelectedProfile(null);
    setRtkFeedback(null);
    setRtkError(null);
    setLoraFeedback(null);
    setLoraError(null);
    setShowRTKModal(true);
  };

  const handleSelectRTKProfile = async (profile: NTRIPProfile) => {
    setIsRTKSubmitting(true);
    setRtkFeedback(null);
    setRtkError(null);

    try {
      const host = profile.casterAddress.trim();
      const port = Number.parseInt(profile.port || "2101", 10);
      const mountpoint = profile.mountpoint.trim();
      const user = profile.username.trim();
      const pass = profile.password.trim();

      if (
        !host ||
        !mountpoint ||
        !user ||
        !pass ||
        !Number.isFinite(port) ||
        port < 1 ||
        port > 65535
      ) {
        const message =
          "NTRIP profile requires host, valid port, mountpoint, username, and password.";
        setRtkError(message);
        Alert.alert("Profile Incomplete", message);
        return;
      }

      // Stop LoRa first if it is active; the backend has one RTK injection source at a time.
      if (loraRunning) {
        await stopLoraStream().catch(() => undefined);
        setLoraRunning(false);
        setLoraConnected(false);
      }

      console.log("[RTK] Starting NTRIP stream", {
        host,
        port,
        mountpoint,
        user,
        pass: "<redacted>",
      });

      const response = await startNtripStream({
        host,
        port,
        mountpoint,
        user,
        pass,
      });
      console.log("[RTK] NTRIP start response", {
        mode: response.mode,
        running: response.running,
        healthy: response.healthy,
        active_source: response.active_source,
        desired_source: response.desired_source,
        lifecycle_state: response.lifecycle_state,
        last_error: response.last_error,
        last_process_error: response.last_process_error,
      });

      if (applyRtkStatus(response)) {
        setRtkFeedback("RTK stream started successfully.");
        setIsRTKStreamRunning(true);
        setActiveProfileId(profile.id);
        startRTKMonitor();

        setTimeout(async () => {
          try {
            const status = await getRtkStatus();
            console.log("[RTK] NTRIP verify status", {
              mode: status.mode,
              running: status.running,
              healthy: status.healthy,
              active_source: status.active_source,
              desired_source: status.desired_source,
              lifecycle_state: status.lifecycle_state,
              last_error: status.last_error,
              last_process_error: status.last_process_error,
            });
            const running = applyRtkStatus(status);
            if (running) {
              Alert.alert("Success", `Connected to ${profile.name}`);
            } else {
              const message =
                status.last_error ||
                status.last_process_error ||
                "Stream started but connection failed. Check credentials and network.";
              setRtkError(message);
              setIsRTKStreamRunning(false);
              setActiveProfileId(null);
              stopRTKMonitor();
              Alert.alert("Connection Failed", message);
            }
          } catch (err) {
            console.warn("[RTK] Failed to verify connection status:", err);
          }
        }, 1000);
      } else {
        const message =
          response.last_error ||
          response.last_process_error ||
          `NTRIP did not start (state: ${response.lifecycle_state ?? response.source_state ?? "unknown"}).`;
        console.warn("[RTK] NTRIP start returned non-running status", response);
        setRtkError(message);
        Alert.alert("Connection Failed", message);
      }
    } catch (err) {
      console.error("[RTK] NTRIP start failed", err);
      const errorMsg = getRtkFailureMessage(err, "Failed to start RTK stream.");
      setRtkError(errorMsg);
      Alert.alert("Error", errorMsg);
    } finally {
      setIsRTKSubmitting(false);
    }
  };

  const handleStopRTKStream = async () => {
    setIsRTKSubmitting(true);
    setRtkFeedback(null);
    setRtkError(null);

    try {
      const response = await stopAllRtk();
      console.log("[RTK] Stop all response", {
        mode: response.mode,
        running: response.running,
        lifecycle_state: response.lifecycle_state,
        last_error: response.last_error,
      });
      applyRtkStatus(response);
      setRtkFeedback("RTK stream stopped successfully.");
      setIsRTKStreamRunning(false);
      setLoraRunning(false);
      setLoraConnected(false);
      setRtkHealthy(false);
      setRtkActiveSource(null);
      setRtkStatusMessage("Idle");
      setActiveProfileId(null);
      stopRTKMonitor();
    } catch (err) {
      console.error("[RTK] Stop all failed", err);
      setRtkError(getRtkFailureMessage(err, "Failed to stop RTK stream."));
    } finally {
      setIsRTKSubmitting(false);
    }
  };

  const handleAddNewRTKProfile = () => {
    setSelectedProfile(null);
    setModalScreen("editor");
  };

  const handleEditRTKProfile = (profile: NTRIPProfile) => {
    setSelectedProfile(profile);
    setModalScreen("editor");
  };

  const handleRTKProfileSaved = () => {
    setModalScreen("list");
    setSelectedProfile(null);
  };

  const handleCancelRTKEdit = () => {
    setModalScreen("list");
    setSelectedProfile(null);
  };

  // LoRa Handlers
  const handleStartLora = async () => {
    setIsRTKSubmitting(true);
    setLoraFeedback(null);
    setLoraError(null);

    try {
      const serialPort = loraSerialPort.trim();
      const baudrate = Number.parseInt(loraBaudrate || "115200", 10);

      if (!serialPort || !Number.isFinite(baudrate) || baudrate <= 0) {
        const message = "LoRa requires a serial port and a valid baud rate.";
        setLoraError(message);
        Alert.alert("LoRa Config Incomplete", message);
        return;
      }

      // Stop NTRIP first if running
      if (isRTKStreamRunning) {
        await stopAllRtk();
        setIsRTKStreamRunning(false);
        setActiveProfileId(null);
        stopRTKMonitor();
      }

      console.log("[RTK] Starting LoRa stream", {
        serial_port: serialPort,
        baudrate,
      });
      const response = await startLoraStream({
        serial_port: serialPort,
        baudrate,
      });
      console.log("[RTK] LoRa start response", {
        mode: response.mode,
        running: response.running,
        healthy: response.healthy,
        active_source: response.active_source,
        desired_source: response.desired_source,
        lifecycle_state: response.lifecycle_state,
        last_error: response.last_error,
      });
      if (applyRtkStatus(response)) {
        setLoraFeedback("LoRa stream started successfully.");
        setLoraRunning(true);
        startRTKMonitor();
      } else {
        setLoraError(
          response.last_error ||
            `LoRa did not start (state: ${response.lifecycle_state ?? response.source_state ?? "unknown"}).`,
        );
      }
    } catch (err) {
      console.error("[RTK] LoRa start failed", err);
      setLoraError(getRtkFailureMessage(err, "Failed to start LoRa stream."));
    } finally {
      setIsRTKSubmitting(false);
    }
  };

  const handleStopLora = async () => {
    setIsRTKSubmitting(true);
    setLoraFeedback(null);
    setLoraError(null);

    try {
      const response = await stopLoraStream();
      console.log("[RTK] LoRa stop response", {
        mode: response.mode,
        running: response.running,
        lifecycle_state: response.lifecycle_state,
        last_error: response.last_error,
      });
      applyRtkStatus(response);
      setLoraFeedback("LoRa stream stopped successfully.");
      setLoraRunning(false);
      setLoraConnected(false);
      setRtkHealthy(false);
      setRtkActiveSource(null);
      setRtkStatusMessage("Idle");
      stopRTKMonitor();
    } catch (err) {
      console.error("[RTK] LoRa stop failed", err);
      setLoraError(getRtkFailureMessage(err, "Failed to stop LoRa stream."));
    } finally {
      setIsRTKSubmitting(false);
    }
  };

  const handleSwitchRTKSource = async (source: "ntrip" | "lora") => {
    if (source === rtkSource) return;
    // Stop the other source if active
    if (source === "ntrip" && loraRunning) {
      await stopLoraStream().catch(() => undefined);
      setLoraRunning(false);
    } else if (source === "lora" && isRTKStreamRunning) {
      await stopAllRtk().catch(() => undefined);
      setIsRTKStreamRunning(false);
      stopRTKMonitor();
    }
    setRtkSource(source);
    setRtkFeedback(null);
    setRtkError(null);
    setLoraFeedback(null);
    setLoraError(null);
  };

  // GPS failsafe mode is now persisted by backend, no need for AsyncStorage

  // Load all settings on mount
  React.useEffect(() => {
    if (visible) {
      // Small delay to allow backend connection to establish
      const timer = setTimeout(() => {
        loadAllSettings();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const loadAllSettings = async () => {
    console.log("═══════════════════════════════════════");
    console.log("⚙️ LOADING SETTINGS FROM BACKEND/STORAGE");
    console.log("═══════════════════════════════════════");

    // Load TTS settings from backend
    await loadTTSStatus();

    // Load Servo Configuration from backend
    await loadServoConfig();

    // Load LED controller status from backend and AsyncStorage
    await loadLedStatus();

    // Load obstacle detection state from AsyncStorage
    try {
      const savedObstacleState = await AsyncStorage.getItem(
        "obstacle_detection_enabled",
      );
      if (savedObstacleState !== null) {
        const isEnabled = savedObstacleState === "true";
        setObstacleDetectionEnabled(isEnabled);
        console.log(
          "✅ Obstacle Detection (from storage):",
          isEnabled ? "ENABLED" : "DISABLED",
        );
      } else {
        console.log(
          "⚠️  No saved obstacle detection state found, defaulting to DISABLED",
        );
      }
    } catch (error) {
      console.error("❌ Failed to load obstacle detection state:", error);
    }

    // GPS Failsafe mode is loaded from backend via RoverContext
    console.log(
      "✅ GPS Failsafe Mode (from backend via context):",
      gpsFailsafeMode.toUpperCase(),
    );

    console.log("═══════════════════════════════════════");
    console.log("✅ ALL SETTINGS LOADED");
    console.log("═══════════════════════════════════════");
  };

  const loadServoConfig = async () => {
    try {
      console.log("[Settings] Loading servo configuration...");
      const response = await services.getMissionServoConfig();

      if (response.success) {
        // Backend returns config in 'message' field
        const config =
          (response as any).message ||
          (response as any).config ||
          (response as any).data ||
          response;

        setServoEnabled(config.servo_enabled ?? false);
        setServoChannel(config.servo_channel ?? 9);
        setServoPwmOn(config.servo_pwm_on ?? 2300);
        setServoPwmOff(config.servo_pwm_off ?? 1750);
        setServoDelayBefore(config.servo_delay_before ?? 0.0);
        setServoSprayDuration(config.servo_spray_duration ?? 5.0);
        setServoDelayAfter(config.servo_delay_after ?? 0.0);
        setServoConfigLoaded(true);
        console.log("[Settings] ✅ Servo config loaded:", {
          enabled: config.servo_enabled,
          channel: config.servo_channel,
          pwm_on: config.servo_pwm_on,
          pwm_off: config.servo_pwm_off,
        });
      } else {
        console.warn(
          "[Settings] ⚠️ Failed to load servo config:",
          response.message,
        );
      }
    } catch (error) {
      console.error("[Settings] ❌ Error loading servo config:", error);
    }
  };

  const loadLedStatus = async () => {
    // Load from AsyncStorage first (for persistence)
    try {
      const savedLedState = await AsyncStorage.getItem("led_enabled");
      if (savedLedState !== null) {
        const isEnabled = savedLedState === "true";
        setLedEnabled(isEnabled);
        console.log(
          "[Settings] ✅ LED status (from storage):",
          isEnabled ? "ENABLED" : "DISABLED",
        );
      } else {
        console.log(
          "[Settings] ⚠️  No saved LED state found, defaulting to DISABLED",
        );
      }
    } catch (error) {
      console.error(
        "[Settings] ❌ Failed to load LED state from storage:",
        error,
      );
    }

    // Load from backend (if endpoint exists) - gracefully skip if not available yet
    try {
      const response = await services.getLEDControllerStatus();
      if (response?.success && response.enabled !== undefined) {
        setLedEnabled(response.enabled);
        console.log(
          "[Settings] ✅ LED status (from backend):",
          response.enabled ? "ENABLED" : "DISABLED",
        );
      }
    } catch {
      // Backend LED endpoint not yet deployed — fallback to storage value
    }
  };

  // Listen for obstacle detection status changes from backend
  React.useEffect(() => {
    if (!visible) return;

    const unsubscribe = onMissionEvent((event: any) => {
      if (
        event.type === "obstacle_detection_changed" &&
        event.data?.enabled !== undefined
      ) {
        const timestamp = new Date().toLocaleTimeString();
        const status = event.data.enabled ? "ENABLED ✅" : "DISABLED ⛔";

        console.log("═══════════════════════════════════════");
        console.log("🔔 BACKEND CONFIRMATION RECEIVED");
        console.log("═══════════════════════════════════════");
        console.log("Event Type:", event.type);
        console.log("Obstacle Detection Status:", status);
        console.log("Backend Timestamp:", event.data.timestamp || "N/A");
        console.log("Frontend Received:", timestamp);
        console.log("Full Event Data:", event.data);
        console.log("═══════════════════════════════════════");

        // Update state
        setObstacleDetectionEnabled(event.data.enabled);
        setLastObstacleUpdate(timestamp);
        setIsLoadingObstacle(false);

        // Persist to AsyncStorage
        AsyncStorage.setItem(
          "obstacle_detection_enabled",
          String(event.data.enabled),
        )
          .then(() =>
            console.log(
              "[Settings] Obstacle detection state saved to storage:",
              event.data.enabled,
            ),
          )
          .catch((err) =>
            console.error("[Settings] Failed to save obstacle state:", err),
          );

        // Show success message
        setSuccessMessage(
          `Obstacle detection ${event.data.enabled ? "enabled" : "disabled"} successfully`,
        );
        setTimeout(() => setSuccessMessage(""), 3000);
      } else if (event.type === "obstacle_error") {
        console.error("═══════════════════════════════════════");
        console.error("❌ OBSTACLE DETECTION ERROR");
        console.error("═══════════════════════════════════════");
        console.error("Error Message:", event.message || "Unknown error");
        console.error("Error Data:", event.data);
        console.error("═══════════════════════════════════════");

        setIsLoadingObstacle(false);
        Alert.alert(
          "Error",
          `Failed to toggle obstacle detection: ${event.message || "Unknown error"}`,
        );
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Listen for LED controller status changes from backend
  React.useEffect(() => {
    if (!visible) return;

    const unsubscribe = onMissionEvent((event: any) => {
      if (
        event.type === "led_controller_changed" &&
        event.data?.enabled !== undefined
      ) {
        const timestamp = new Date().toLocaleTimeString();
        const status = event.data.enabled ? "ENABLED ✅" : "DISABLED ⛔";

        console.log("═══════════════════════════════════════");
        console.log("🔔 BACKEND CONFIRMATION RECEIVED");
        console.log("═══════════════════════════════════════");
        console.log("Event Type:", event.type);
        console.log("LED Controller Status:", status);
        console.log("Backend Timestamp:", event.data.timestamp || "N/A");
        console.log("Frontend Received:", timestamp);
        console.log("Full Event Data:", event.data);
        console.log("═══════════════════════════════════════");

        // Update state
        setLedEnabled(event.data.enabled);
        setLastLedUpdate(timestamp);
        setIsLoadingLed(false);

        // Persist to AsyncStorage
        AsyncStorage.setItem("led_enabled", String(event.data.enabled))
          .then(() =>
            console.log(
              "[Settings] LED controller state saved to storage:",
              event.data.enabled,
            ),
          )
          .catch((err) =>
            console.error("[Settings] Failed to save LED state:", err),
          );

        // Show success message
        setSuccessMessage(
          `LED controller ${event.data.enabled ? "enabled" : "disabled"} successfully`,
        );
        setTimeout(() => setSuccessMessage(""), 3000);
      } else if (event.type === "led_error") {
        console.error("═══════════════════════════════════════");
        console.error("❌ LED CONTROLLER ERROR");
        console.error("═══════════════════════════════════════");
        console.error("Error Message:", event.message || "Unknown error");
        console.error("Error Data:", event.data);
        console.error("═══════════════════════════════════════");

        setIsLoadingLed(false);
        Alert.alert(
          "Error",
          `Failed to toggle LED controller: ${event.message || "Unknown error"}`,
        );
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const loadTTSStatus = async () => {
    try {
      const response = await services.getTTSStatus();
      if (response.success) {
        setTtsEnabled(response.enabled || false);
        const lang = response.language || "en";
        setTtsLanguage(
          ["en", "ta", "hi"].includes(lang)
            ? (lang as "en" | "ta" | "hi")
            : "en",
        );
      }
    } catch (error) {
      console.error("[Settings] Failed to load TTS status:", error);
    }

    // Load gender (new endpoint — gracefully skip if not yet deployed)
    try {
      const gRes = await services.getTTSGender();
      if (
        gRes?.success &&
        (gRes.gender === "male" || gRes.gender === "female")
      ) {
        setTtsGender(gRes.gender);
      }
    } catch {
      // Backend gender endpoint not yet deployed — default stays 'male'
    }
  };

  const handleTTSToggle = async (enabled: boolean) => {
    setIsLoadingTTS(true);
    try {
      const response = await services.controlTTS(enabled);
      if (response.success) {
        setTtsEnabled(enabled);
        console.log("[Settings] TTS", enabled ? "enabled" : "disabled");
      } else {
        Alert.alert("Error", "Failed to toggle voice settings");
      }
    } catch (error) {
      console.error("[Settings] TTS toggle error:", error);
      Alert.alert("Error", "Failed to update voice settings");
    } finally {
      setIsLoadingTTS(false);
    }
  };

  const handleLanguageChange = async (lang: "en" | "ta" | "hi") => {
    setIsLoadingTTS(true);
    try {
      const response = await services.setTTSLanguage(lang);
      if (response.success) {
        setTtsLanguage(lang);
        console.log("[Settings] TTS language changed to:", lang);
      } else {
        Alert.alert("Error", "Failed to change language");
      }
    } catch (error) {
      console.error("[Settings] Language change error:", error);
      Alert.alert("Error", "Failed to change language");
    } finally {
      setIsLoadingTTS(false);
    }
  };

  const handleGenderChange = async (gender: "male" | "female") => {
    setIsLoadingTTS(true);
    try {
      const response = await services.setTTSGender(gender);
      if (response.success) {
        setTtsGender(gender);
        console.log("[Settings] TTS gender changed to:", gender);
      } else {
        Alert.alert("Error", "Failed to change voice gender");
      }
    } catch (error) {
      console.error("[Settings] Gender change error:", error);
      Alert.alert(
        "Error",
        "Voice gender endpoint not yet available on backend",
      );
    } finally {
      setIsLoadingTTS(false);
    }
  };

  const handleTestTTS = async () => {
    setIsLoadingTTS(true);
    try {
      const messages = {
        en: "Voice test successful",
        ta: "குரல் சோதனை வெற்றிகரமாக உள்ளது",
        hi: "आवाज परीक्षण सफल",
      };
      await services.testTTS(messages[ttsLanguage]);
    } catch (error) {
      console.error("[Settings] TTS test error:", error);
      Alert.alert("Error", "Voice test failed");
    } finally {
      setIsLoadingTTS(false);
    }
  };

  // Servo Configuration Handlers
  const handleServoEnabledToggle = async (enabled: boolean) => {
    setIsLoadingServo(true);
    try {
      const response = await services.updateMissionServoConfig({
        servo_enabled: enabled,
      });
      if (response.success) {
        setServoEnabled(enabled);
        console.log("[Settings] Servo", enabled ? "enabled" : "disabled");
        setSuccessMessage(
          `Servo ${enabled ? "enabled" : "disabled"} successfully`,
        );
        setTimeout(() => setSuccessMessage(""), 3000);
      } else {
        Alert.alert("Error", response.message || "Failed to toggle servo");
      }
    } catch (error) {
      console.error("[Settings] Servo toggle error:", error);
      Alert.alert("Error", "Failed to update servo settings");
    } finally {
      setIsLoadingServo(false);
    }
  };

  // Servo Test Handler
  const handleServoTest = async (config: any) => {
    try {
      console.log("[Settings] Testing servo config:", config);
      const response = await services.testMissionServoConfig(config);
      console.log("[Settings] Test response:", response);
      return response;
    } catch (error) {
      console.error("[Settings] Servo test error:", error);
      return {
        success: false,
        message: "Failed to test servo configuration",
        status: "fail",
      };
    }
  };

  // Servo Save Handler
  const handleServoSave = async (config: any) => {
    try {
      console.log("[Settings] Saving servo config:", config);
      const response = await services.updateMissionServoConfig(config);

      if (response.success) {
        // Optimistically update local state with saved values
        setServoEnabled(config.servo_enabled);
        setServoChannel(config.servo_channel);
        setServoPwmOn(config.servo_pwm_on);
        setServoPwmOff(config.servo_pwm_off);
        setServoDelayBefore(config.servo_delay_before);
        setServoSprayDuration(config.servo_spray_duration);
        setServoDelayAfter(config.servo_delay_after);

        console.log("[Settings] ✅ Servo config saved successfully");
        setSuccessMessage("Servo configuration saved successfully");
        setTimeout(() => setSuccessMessage(""), 3000);

        // Re-fetch from backend to confirm persisted values match what we saved
        loadServoConfig();
      }

      return response;
    } catch (error) {
      console.error("[Settings] Servo save error:", error);
      return { success: false, message: "Failed to save servo configuration" };
    }
  };

  // Open Servo Config Modal: always re-fetch fresh config before showing
  const handleOpenServoConfigModal = async () => {
    setIsLoadingServoModal(true);
    try {
      await loadServoConfig();
    } finally {
      setIsLoadingServoModal(false);
      setShowServoConfigModal(true);
    }
  };

  const handleObstacleDetectionToggle = async (enabled: boolean) => {
    setIsLoadingObstacle(true);
    const sendTime = new Date().toLocaleTimeString();

    console.log("═══════════════════════════════════════");
    console.log("📤 SENDING TO BACKEND");
    console.log("═══════════════════════════════════════");
    console.log("Action: Set Obstacle Detection");
    console.log("Requested State:", enabled ? "ENABLE" : "DISABLE");
    console.log("Time Sent:", sendTime);
    console.log("═══════════════════════════════════════");

    try {
      const response = await services.setObstacleDetection(enabled);

      console.log("📥 Initial Response:", response);

      if (response.success) {
        // Optimistically update UI - will be confirmed by socket event
        setObstacleDetectionEnabled(enabled);
        console.log(
          "✅ Command sent successfully. Waiting for backend confirmation...",
        );
      } else {
        setIsLoadingObstacle(false);
        console.error("❌ Command failed:", response.message);
        Alert.alert(
          "Error",
          response.message || "Failed to toggle obstacle detection",
        );
      }
    } catch (error) {
      console.error("═══════════════════════════════════════");
      console.error("💥 EXCEPTION OCCURRED");
      console.error("═══════════════════════════════════════");
      console.error("Error:", error);
      console.error("═══════════════════════════════════════");
      setIsLoadingObstacle(false);
      Alert.alert("Error", "Failed to update obstacle detection");
    }
    // Note: loading state will be cleared by the socket event listener
  };

  const handleLedToggle = async (enabled: boolean) => {
    setIsLoadingLed(true);
    const sendTime = new Date().toLocaleTimeString();

    console.log("═══════════════════════════════════════");
    console.log("📤 SENDING TO BACKEND");
    console.log("═══════════════════════════════════════");
    console.log("Action: Set LED Controller");
    console.log("Requested State:", enabled ? "ENABLE" : "DISABLE");
    console.log("Time Sent:", sendTime);
    console.log("═══════════════════════════════════════");

    try {
      const response = await services.setLEDController(enabled);

      console.log("📥 Initial Response:", response);

      if (response.success) {
        // Optimistically update UI - will be confirmed by socket event
        setLedEnabled(enabled);
        // Persist to AsyncStorage immediately
        AsyncStorage.setItem("led_enabled", String(enabled))
          .then(() =>
            console.log("[Settings] LED state saved to storage:", enabled),
          )
          .catch((err) =>
            console.error("[Settings] Failed to save LED state:", err),
          );
        console.log(
          "✅ Command sent successfully. Waiting for backend confirmation...",
        );
      } else {
        setIsLoadingLed(false);
        console.error("❌ Command failed:", response.message);
        Alert.alert(
          "Error",
          response.message || "Failed to toggle LED controller",
        );
      }
    } catch (error) {
      console.error("═══════════════════════════════════════");
      console.error("💥 EXCEPTION OCCURRED");
      console.error("═══════════════════════════════════════");
      console.error("Error:", error);
      console.error("═══════════════════════════════════════");
      setIsLoadingLed(false);
      // Fallback: if backend call fails, update local state and persist
      setLedEnabled(enabled);
      AsyncStorage.setItem("led_enabled", String(enabled))
        .then(() => {
          console.log(
            "[Settings] LED state saved to storage (fallback):",
            enabled,
          );
          setSuccessMessage(
            `LED controller ${enabled ? "enabled" : "disabled"}`,
          );
          setTimeout(() => setSuccessMessage(""), 3000);
        })
        .catch((err) =>
          console.error("[Settings] Failed to save LED state:", err),
        );
    }
    // Note: loading state will be cleared by the socket event listener if backend responds
  };

  const getLanguageLabel = (lang: string) => {
    switch (lang) {
      case "en":
        return "English";
      case "ta":
        return "Tamil (தமிழ்)";
      case "hi":
        return "Hindi (हिंदी)";
      default:
        return lang;
    }
  };

  const handleLogout = useCallback(() => {
    Alert.alert(
      "Logout",
      `Logout ${session?.username ?? "admin"} from the DYX Rover application?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            onClose();
            await logout();
          },
        },
      ],
    );
  }, [logout, onClose, session?.username]);

  // Check if mission is active (memoized to prevent recalculating on every render)
  const isMissionActive = React.useMemo(() => {
    const missionStatus = (telemetry.mission.status || "IDLE").toUpperCase();
    const isMissionCompleted =
      telemetry.mission.total_wp > 0 &&
      telemetry.mission.current_wp >= telemetry.mission.total_wp &&
      telemetry.mission.progress_pct >= 100;
    return (
      !["IDLE", "STANDBY", ""].includes(missionStatus) && !isMissionCompleted
    );
  }, [
    telemetry.mission.status,
    telemetry.mission.total_wp,
    telemetry.mission.current_wp,
    telemetry.mission.progress_pct,
  ]);

  // Memoize servo config to prevent unnecessary re-renders and useEffect triggers
  const servoConfig = React.useMemo(
    () => ({
      servo_channel: servoChannel,
      servo_pwm_on: servoPwmOn,
      servo_pwm_off: servoPwmOff,
      servo_delay_before: servoDelayBefore,
      servo_spray_duration: servoSprayDuration,
      servo_delay_after: servoDelayAfter,
      servo_enabled: servoEnabled,
    }),
    [
      servoChannel,
      servoPwmOn,
      servoPwmOff,
      servoDelayBefore,
      servoSprayDuration,
      servoDelayAfter,
      servoEnabled,
    ],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Success Toast */}
        {successMessage && (
          <View style={styles.successToast}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successToastText}>{successMessage}</Text>
          </View>
        )}

        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>⚙️ Settings</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 1. RTK Injection Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>📡</Text>
                <Text style={styles.sectionTitle}>RTK Injection</Text>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>
                    {loraRunning ? "LoRa Connection" : "NTRIP Connection"}
                  </Text>
                  <Text style={styles.settingDescription}>
                    {isRTKStreamRunning
                      ? `NTRIP Connected • ${rtkTotalBytes} bytes received • ${rtkStatusMessage}`
                      : loraRunning
                        ? `LoRa Connected • ${rtkTotalBytes} bytes received • ${rtkStatusMessage}`
                        : "Not connected - Configure NTRIP or LoRa"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    isRTKStreamRunning || loraRunning
                      ? styles.statusBadgeOn
                      : styles.statusBadgeOff,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {isRTKStreamRunning || loraRunning
                      ? rtkHealthy
                        ? "HEALTHY"
                        : "ACTIVE"
                      : "INACTIVE"}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Configure RTK Button */}
              <TouchableOpacity
                style={[
                  styles.configureButton,
                  isRTKSubmitting && { opacity: 0.6 },
                ]}
                onPress={handleOpenRTKModal}
                disabled={isRTKSubmitting}
              >
                <Text style={styles.configureButtonIcon}>
                  {isRTKSubmitting ? "⏳" : "⚙️"}
                </Text>
                <View style={styles.configureButtonContent}>
                  <Text style={styles.configureButtonTitle}>
                    {isRTKStreamRunning
                      ? "Manage RTK Connection"
                      : "Configure RTK Injection"}
                  </Text>
                  <Text style={styles.configureButtonDescription}>
                    {isRTKSubmitting
                      ? "Processing..."
                      : "Set up NTRIP caster or LoRa receiver"}
                  </Text>
                </View>
                <Text style={styles.configureButtonArrow}>›</Text>
              </TouchableOpacity>

              {(isRTKStreamRunning || loraRunning) && (
                <TouchableOpacity
                  style={[
                    styles.configureButton,
                    { backgroundColor: "#dc2626", marginTop: 12 },
                  ]}
                  onPress={loraRunning ? handleStopLora : handleStopRTKStream}
                  disabled={isRTKSubmitting}
                >
                  <Text style={styles.configureButtonIcon}>⏹️</Text>
                  <View style={styles.configureButtonContent}>
                    <Text
                      style={[styles.configureButtonTitle, { color: "#fff" }]}
                    >
                      Stop {loraRunning ? "LoRa" : "NTRIP"} Stream
                    </Text>
                    <Text
                      style={[
                        styles.configureButtonDescription,
                        { color: "#fca5a5" },
                      ]}
                    >
                      Disconnect from{" "}
                      {loraRunning ? "LoRa receiver" : "NTRIP caster"}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* 2. GPS Failsafe Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🛡️</Text>
                <Text style={styles.sectionTitle}>GPS Mode Config</Text>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Current Mode</Text>
                  <Text style={styles.settingDescription}>
                    {gpsFailsafeMode === "disable"
                      ? "Disabled - No GPS accuracy checks"
                      : gpsFailsafeMode === "strict"
                        ? "Strict - Pause on low accuracy"
                        : "Relax - Warning only"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.changeButton}
                  onPress={() => setShowFailsafeSelector(true)}
                  disabled={isMissionActive}
                >
                  <Text style={styles.changeButtonText}>
                    {gpsFailsafeMode.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              </View>

              {isMissionActive && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    ⚠️ Cannot change failsafe mode during active mission
                  </Text>
                </View>
              )}
            </View>

            {/* 3. Servo Configuration Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>⚡</Text>
                <Text style={styles.sectionTitle}>Spray Configuration</Text>
              </View>

              {/* Read-only status toggle */}
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Spray Status</Text>
                  <Text style={styles.settingDescription}>
                    Current spray state (read-only)
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    servoEnabled ? styles.statusBadgeOn : styles.statusBadgeOff,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {servoEnabled ? "ENABLED" : "DISABLED"}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Configure Servo Button */}
              <TouchableOpacity
                style={[
                  styles.configureButton,
                  isLoadingServoModal && { opacity: 0.6 },
                ]}
                onPress={handleOpenServoConfigModal}
                disabled={isLoadingServoModal}
              >
                <Text style={styles.configureButtonIcon}>
                  {isLoadingServoModal ? "⏳" : "⚙️"}
                </Text>
                <View style={styles.configureButtonContent}>
                  <Text style={styles.configureButtonTitle}>
                    Configure Spray Settings
                  </Text>
                  <Text style={styles.configureButtonDescription}>
                    {isLoadingServoModal
                      ? "Loading config..."
                      : "Adjust channel, PWM values, timing parameters"}
                  </Text>
                </View>
                <Text style={styles.configureButtonArrow}>›</Text>
              </TouchableOpacity>

              {servoConfigLoaded && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    📊 Current Config: CH{servoChannel} | PWM ON:{servoPwmOn}{" "}
                    OFF:{servoPwmOff} | Delays: {servoDelayBefore.toFixed(1)}s /{" "}
                    {servoSprayDuration.toFixed(1)}s /{" "}
                    {servoDelayAfter.toFixed(1)}s
                  </Text>
                </View>
              )}
            </View>

            {/* 4. MAVLink Parameters Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>⚙️</Text>
                <Text style={styles.sectionTitle}>MAVLink Parameters</Text>
              </View>

              <TouchableOpacity
                style={styles.configureButton}
                onPress={() => setShowParamBrowser(true)}
                disabled={connectionState !== "connected"}
              >
                <Text style={styles.configureButtonIcon}>📋</Text>
                <View style={styles.configureButtonContent}>
                  <Text style={styles.configureButtonTitle}>
                    Browse & Edit Parameters
                  </Text>
                  <Text style={styles.configureButtonDescription}>
                    {connectionState !== "connected"
                      ? "Connect to rover to access parameters"
                      : "View and modify ArduRover parameters by group"}
                  </Text>
                </View>
                <Text style={styles.configureButtonArrow}>›</Text>
              </TouchableOpacity>

              {connectionState === "connected" && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    💡 Tip: Use group filters to find params faster (NAVL1,
                    ATC_STR, WP, etc.)
                  </Text>
                </View>
              )}
            </View>

            {/* 5. Voice Settings Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🔊</Text>
                <Text style={styles.sectionTitle}>Voice Settings</Text>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Enable Voice Feedback</Text>
                  <Text style={styles.settingDescription}>
                    Hear mission updates and status announcements
                  </Text>
                </View>
                <Switch
                  value={ttsEnabled}
                  onValueChange={handleTTSToggle}
                  disabled={isLoadingTTS}
                  trackColor={{ false: "#4a5568", true: "#10b981" }}
                  thumbColor={ttsEnabled ? "#ffffff" : "#d1d5db"}
                />
              </View>

              {ttsEnabled && (
                <>
                  <View style={styles.divider} />

                  {/* Gender Selection */}
                  <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Voice Gender</Text>
                  </View>
                  <View style={styles.languageButtons}>
                    {(["male", "female"] as const).map((g) => (
                      <TouchableOpacity
                        key={g}
                        style={[
                          styles.languageButton,
                          ttsGender === g && styles.languageButtonActive,
                        ]}
                        onPress={() => handleGenderChange(g)}
                        disabled={isLoadingTTS}
                      >
                        <Text
                          style={[
                            styles.languageButtonText,
                            ttsGender === g && styles.languageButtonTextActive,
                          ]}
                        >
                          {g === "male" ? "👨 Male" : "👩 Female"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.divider} />

                  {/* Language Selection */}
                  <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Language</Text>
                  </View>
                  <View style={styles.languageButtons}>
                    {(["en", "ta", "hi"] as const).map((lang) => (
                      <TouchableOpacity
                        key={lang}
                        style={[
                          styles.languageButton,
                          ttsLanguage === lang && styles.languageButtonActive,
                        ]}
                        onPress={() => handleLanguageChange(lang)}
                        disabled={isLoadingTTS}
                      >
                        <Text
                          style={[
                            styles.languageButtonText,
                            ttsLanguage === lang &&
                              styles.languageButtonTextActive,
                          ]}
                        >
                          {getLanguageLabel(lang)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={handleTestTTS}
                    disabled={isLoadingTTS}
                  >
                    <Text style={styles.testButtonText}>🎵 Test Voice</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* 5. LED Controller Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>💡</Text>
                <Text style={styles.sectionTitle}>LED Controller</Text>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Enable LED Controller</Text>
                  <Text style={styles.settingDescription}>
                    Control LED indicator lights for system status
                  </Text>
                </View>
                <Switch
                  value={ledEnabled}
                  onValueChange={handleLedToggle}
                  disabled={isLoadingLed}
                  trackColor={{ false: "#4a5568", true: "#fbbf24" }}
                  thumbColor={ledEnabled ? "#ffffff" : "#d1d5db"}
                />
              </View>

              {lastLedUpdate && (
                <Text style={styles.timestampText}>
                  Last updated: {lastLedUpdate}
                </Text>
              )}
            </View>

            {/* 6. Obstacle Detection Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🚫</Text>
                <Text style={styles.sectionTitle}>Obstacle Detection</Text>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>
                    Enable Ultrasonic Sensors
                  </Text>
                  <Text style={styles.settingDescription}>
                    Pause mission when obstacles detected ahead
                  </Text>
                </View>
                <Switch
                  value={obstacleDetectionEnabled}
                  onValueChange={handleObstacleDetectionToggle}
                  disabled={isLoadingObstacle}
                  trackColor={{ false: "#4a5568", true: "#10b981" }}
                  thumbColor={obstacleDetectionEnabled ? "#ffffff" : "#d1d5db"}
                />
              </View>

              {obstacleDetectionEnabled && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    ℹ️ Mission will automatically pause when obstacles are
                    detected. Resume manually after clearing the obstacle.
                  </Text>
                </View>
              )}

              {lastObstacleUpdate && (
                <Text style={styles.timestampText}>
                  Last updated: {lastObstacleUpdate}
                </Text>
              )}
            </View>

            {/* 7. Sprayer Configuration Section */}
            <View style={[styles.section, styles.sectionDisabled]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>💧</Text>
                <Text style={styles.sectionTitle}>Sprayer Configuration</Text>
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>Coming Soon</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Logout from rover"
            >
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.doneButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Failsafe Mode Selector Modal */}

        {/* Failsafe Mode Selector Modal */}
        <FailsafeModeSelector
          visible={showFailsafeSelector}
          currentMode={gpsFailsafeMode}
          onModeChange={setGpsFailsafeMode}
          onClose={() => setShowFailsafeSelector(false)}
          disabled={isMissionActive}
        />

        {/* Servo Configuration Modal */}
        <ServoConfigModal
          visible={showServoConfigModal}
          currentConfig={servoConfig}
          onClose={() => setShowServoConfigModal(false)}
          onTest={handleServoTest}
          onSave={handleServoSave}
        />

        {/* MAVLink Param Browser Modal */}
        <ParamBrowserModal
          visible={showParamBrowser}
          onClose={() => setShowParamBrowser(false)}
        />

        {/* RTK Profile Manager Modal */}
        <Modal
          visible={showRTKModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowRTKModal(false)}
        >
          <View style={rtkModalStyles.modalOverlay}>
            <View style={rtkModalStyles.modalContent}>
              <View style={rtkModalStyles.modalHeader}>
                <Text style={rtkModalStyles.modalTitle}>RTK Injection</Text>
                <TouchableOpacity onPress={() => setShowRTKModal(false)}>
                  <Text style={rtkModalStyles.modalCloseButton}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Source Toggle: NTRIP | LoRa */}
              <View style={rtkModalStyles.sourceToggle}>
                <TouchableOpacity
                  style={[
                    rtkModalStyles.toggleButton,
                    rtkSource === "ntrip" && rtkModalStyles.toggleActive,
                  ]}
                  onPress={() => handleSwitchRTKSource("ntrip")}
                >
                  <Text
                    style={[
                      rtkModalStyles.toggleText,
                      rtkSource === "ntrip" && rtkModalStyles.toggleTextActive,
                    ]}
                  >
                    📡 NTRIP
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    rtkModalStyles.toggleButton,
                    rtkSource === "lora" && rtkModalStyles.toggleActive,
                  ]}
                  onPress={() => handleSwitchRTKSource("lora")}
                >
                  <Text
                    style={[
                      rtkModalStyles.toggleText,
                      rtkSource === "lora" && rtkModalStyles.toggleTextActive,
                    ]}
                  >
                    📻 LoRa
                  </Text>
                </TouchableOpacity>
              </View>

              {/* NTRIP Tab */}
              {rtkSource === "ntrip" && (
                <View style={rtkModalStyles.modalBody}>
                  {modalScreen === "list" ? (
                    <NTRIPProfileList
                      onSelectProfile={handleSelectRTKProfile}
                      onAddNew={handleAddNewRTKProfile}
                      onEditProfile={handleEditRTKProfile}
                      isConnecting={isRTKSubmitting}
                      activeProfileId={activeProfileId}
                      isStreamRunning={isRTKStreamRunning}
                    />
                  ) : (
                    <NTRIPProfileEditor
                      profile={selectedProfile}
                      onSave={handleRTKProfileSaved}
                      onCancel={handleCancelRTKEdit}
                    />
                  )}

                  {rtkFeedback && (
                    <View style={rtkModalStyles.feedbackBox}>
                      <Text style={rtkModalStyles.feedbackText}>
                        {rtkFeedback}
                      </Text>
                    </View>
                  )}

                  {rtkError && (
                    <View style={rtkModalStyles.errorBox}>
                      <Text style={rtkModalStyles.errorText}>{rtkError}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* LoRa Tab */}
              {rtkSource === "lora" && (
                <View style={rtkModalStyles.modalBody}>
                  <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                    {/* LoRa Status Header */}
                    <View style={rtkModalStyles.loraStatusHeader}>
                      <Text style={rtkModalStyles.loraSectionTitle}>
                        LoRa USB Receiver
                      </Text>
                      <View
                        style={[
                          rtkModalStyles.loraPill,
                          loraRunning
                            ? rtkModalStyles.loraPillSuccess
                            : rtkModalStyles.loraPillDanger,
                        ]}
                      >
                        <Text style={rtkModalStyles.loraPillText}>
                          {loraRunning ? "Streaming" : "Stopped"}
                        </Text>
                      </View>
                    </View>

                    <View style={rtkModalStyles.manualEntrySection}>
                      <Text style={rtkModalStyles.manualEntryTitle}>
                        Receiver Port
                      </Text>
                      <TextInput
                        style={rtkModalStyles.input}
                        placeholder="/dev/ttyUSB0"
                        placeholderTextColor="#94a3b8"
                        value={loraSerialPort}
                        onChangeText={setLoraSerialPort}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TextInput
                        style={rtkModalStyles.input}
                        placeholder="115200"
                        placeholderTextColor="#94a3b8"
                        value={loraBaudrate}
                        onChangeText={setLoraBaudrate}
                        keyboardType="numeric"
                      />
                    </View>

                    {/* LoRa Stats Grid */}
                    <View style={rtkModalStyles.loraStatsGrid}>
                      <View style={rtkModalStyles.loraStatBox}>
                        <Text style={rtkModalStyles.loraStatLabel}>
                          Connection
                        </Text>
                        <Text
                          style={[
                            rtkModalStyles.loraStatValue,
                            { color: loraConnected ? "#10b981" : "#ef4444" },
                          ]}
                        >
                          {loraConnected ? "Connected" : "Not Connected"}
                        </Text>
                      </View>
                      <View style={rtkModalStyles.loraStatBox}>
                        <Text style={rtkModalStyles.loraStatLabel}>Source</Text>
                        <Text style={rtkModalStyles.loraStatValue}>
                          {rtkActiveSource ?? "None"}
                        </Text>
                      </View>
                      <View style={rtkModalStyles.loraStatBox}>
                        <Text style={rtkModalStyles.loraStatLabel}>Bytes</Text>
                        <Text style={rtkModalStyles.loraStatValue}>
                          {(rtkTotalBytes / 1024).toFixed(2)} KB
                        </Text>
                      </View>
                      <View style={rtkModalStyles.loraStatBox}>
                        <Text style={rtkModalStyles.loraStatLabel}>Health</Text>
                        <Text
                          style={[
                            rtkModalStyles.loraStatValue,
                            { color: rtkHealthy ? "#10b981" : "#f59e0b" },
                          ]}
                        >
                          {rtkHealthy
                            ? "Healthy"
                            : loraRunning
                              ? "Running"
                              : "Idle"}
                        </Text>
                      </View>
                    </View>

                    {/* LoRa Status Message */}
                    <View style={rtkModalStyles.loraMessageBox}>
                      <Text style={rtkModalStyles.loraMessageLabel}>
                        Status
                      </Text>
                      <Text style={rtkModalStyles.loraMessageValue}>
                        {rtkStatusMessage}
                      </Text>
                    </View>

                    {/* LoRa Action Buttons */}
                    <View style={rtkModalStyles.loraButtonRow}>
                      <TouchableOpacity
                        style={[
                          rtkModalStyles.loraButton,
                          rtkModalStyles.loraButtonStart,
                          loraRunning && rtkModalStyles.loraButtonDisabled,
                        ]}
                        onPress={handleStartLora}
                        disabled={loraRunning || isRTKSubmitting}
                      >
                        <Text style={rtkModalStyles.loraButtonText}>
                          ▶ Start Stream
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          rtkModalStyles.loraButton,
                          rtkModalStyles.loraButtonStop,
                          !loraRunning && rtkModalStyles.loraButtonDisabled,
                        ]}
                        onPress={handleStopLora}
                        disabled={!loraRunning || isRTKSubmitting}
                      >
                        <Text style={rtkModalStyles.loraButtonText}>
                          ⏹ Stop Stream
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {loraFeedback && (
                      <View style={rtkModalStyles.feedbackBox}>
                        <Text style={rtkModalStyles.feedbackText}>
                          {loraFeedback}
                        </Text>
                      </View>
                    )}

                    {loraError && (
                      <View style={rtkModalStyles.errorBox}>
                        <Text style={rtkModalStyles.errorText}>
                          {loraError}
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

// Wrap with React.memo to prevent unnecessary re-renders
// Only re-render when visible or onClose changes
export const SettingsScreen = React.memo(
  SettingsScreenComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.visible === nextProps.visible &&
      prevProps.onClose === nextProps.onClose
    );
  },
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "95%",
    maxWidth: 800,
    height: "95%",
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.3)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: "#002244",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(103, 232, 249, 0.3)",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 20,
    color: colors.text,
    fontWeight: "bold",
  },
  content: {
    flex: 1,
    flexGrow: 1,
    minHeight: 400,
  },
  scrollContent: {
    padding: 24,
    flexGrow: 1,
  },
  section: {
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.2)",
  },
  sectionDisabled: {
    opacity: 0.5,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  sectionIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
    flex: 1,
  },
  comingSoonBadge: {
    backgroundColor: "rgba(251, 191, 36, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fbbf24",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  settingInfo: {
    flex: 1,
    marginRight: 2,
  },
  settingLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 15,
    color: "#94a3b8",
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(103, 232, 249, 0.2)",
    marginVertical: 12,
  },
  languageButtons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  languageButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
    borderWidth: 2,
    borderColor: "#4a5568",
    alignItems: "center",
  },
  languageButtonActive: {
    backgroundColor: "#06b6d4",
    borderColor: "#06b6d4",
  },
  languageButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
  },
  languageButtonTextActive: {
    color: colors.text,
  },
  testButton: {
    backgroundColor: "#7c3aed",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  changeButton: {
    backgroundColor: "#1a75d2",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#059669",
  },
  changeButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  warningBox: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  warningText: {
    fontSize: 13,
    color: "#fbbf24",
    textAlign: "center",
  },
  infoBox: {
    backgroundColor: "rgba(6, 182, 212, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.3)",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#67e8f9",
    lineHeight: 18,
  },
  timestampText: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 8,
    fontStyle: "italic",
  },
  successToast: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 9999,
  },
  successToastText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  successIcon: {
    fontSize: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#002244",
    borderTopWidth: 1,
    borderTopColor: "rgba(103, 232, 249, 0.3)",
    flexDirection: "row",
    gap: 12,
  },

  logoutButton: {
    flex: 1,
    backgroundColor: "#7F1D1D",
    borderWidth: 1,
    borderColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },

  logoutButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FEE2E2",
  },

  doneButton: {
    flex: 1,
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },

  doneButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.text,
  },
  // Servo Configuration Styles
  channelButtons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  channelButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
    borderWidth: 2,
    borderColor: "#4a5568",
    alignItems: "center",
  },
  channelButtonActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  channelButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
  },
  channelButtonTextActive: {
    color: "#1a1a1a",
  },
  pwmContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  pwmInput: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
  },
  pwmLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 8,
    textAlign: "center",
  },
  pwmValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pwmButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  pwmButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
  },
  pwmValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f59e0b",
    minWidth: 60,
    textAlign: "center",
  },
  timingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
  },
  timingInfo: {
    flex: 1,
  },
  timingLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  timingDescription: {
    fontSize: 12,
    color: "#94a3b8",
  },
  timingControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  timingButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  timingButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.text,
  },
  timingValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#10b981",
    minWidth: 50,
    textAlign: "center",
    marginHorizontal: 8,
  },
  // New Servo UI Styles
  statusBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  statusBadgeOn: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderColor: "#10b981",
  },
  statusBadgeOff: {
    backgroundColor: "rgba(107, 114, 128, 0.2)",
    borderColor: "#6b7280",
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.text,
  },
  configureButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a75d2",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#059669",
  },
  configureButtonIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  configureButtonContent: {
    flex: 1,
  },
  configureButtonTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 4,
  },
  configureButtonDescription: {
    fontSize: 13,
    color: "#94a3b8",
  },
  configureButtonArrow: {
    fontSize: 32,
    color: colors.text,
    fontWeight: "bold",
  },
});

// RTK Modal Styles
const rtkModalStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 20,
    width: "90%",
    height: "85%",
    maxHeight: "85%",
    borderWidth: 2,
    borderColor: "#3b82f6",
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#3b82f6",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
  },
  modalCloseButton: {
    fontSize: 24,
    color: "#94a3b8",
    padding: 4,
  },
  feedbackBox: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    borderColor: "#10b981",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  feedbackText: {
    color: "#10b981",
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderColor: "#ef4444",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
  },
  // Source Toggle
  sourceToggle: {
    flexDirection: "row",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#3b82f6",
    borderRadius: 10,
    overflow: "hidden",
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#1a1a2e",
  },
  toggleActive: {
    backgroundColor: "#3b82f6",
  },
  toggleText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "700",
  },
  toggleTextActive: {
    color: "#ffffff",
  },
  // LoRa Tab Styles
  loraStatusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  loraSectionTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  loraPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  loraPillSuccess: {
    backgroundColor: "#10b981",
  },
  loraPillDanger: {
    backgroundColor: "#ef4444",
  },
  loraPillText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  loraStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  loraStatBox: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#374151",
  },
  loraStatLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 4,
  },
  loraStatValue: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  loraMessageBox: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#374151",
    marginBottom: 16,
  },
  loraMessageLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 4,
  },
  loraMessageValue: {
    color: "#ffffff",
    fontSize: 14,
  },
  loraButtonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  loraButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  loraButtonStart: {
    backgroundColor: "#3b82f6",
  },
  loraButtonStop: {
    backgroundColor: "#ef4444",
  },
  loraButtonDisabled: {
    opacity: 0.4,
  },
  loraButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  manualEntrySection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  manualEntryTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#374151",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    backgroundColor: "#3b82f6",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: "#4b5563",
    opacity: 0.6,
  },
  stopButton: {
    flex: 1,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
