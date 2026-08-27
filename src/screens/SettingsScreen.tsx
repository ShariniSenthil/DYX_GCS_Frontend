import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/colors";
import { useRover } from "../context/RoverContext";
import { FailsafeModeSelector } from "../components/pathplan/FailsafeModeSelector";
import { ServoConfigModal } from "../components/settings/ServoConfigModal";
import { ParamBrowserModal } from "../components/settings/ParamBrowserModal";
import { RTKInjectionScreen } from "../components/missionreport/RTKInjectionScreen";
import { getRtkStatus, stopRtk } from "../services/rtkService";
import { toRtkControlView } from "../adapters/rtkControlAdapter";
import { useAuth } from "../hooks/useAuth";
import { getSprayConfig, setSprayConfig } from "../services/sprayConfigService";

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
  // PX4 contract is permanently AUX5.
  const [servoChannel, setServoChannel] = useState(5);

  // Dynamic backend-controlled servo positions.
  const [servoPwmOn, setServoPwmOn] = useState(2000);
  const [servoPwmOff, setServoPwmOff] = useState(1500);

  // Current production spray logic.
  const [servoDelayBefore, setServoDelayBefore] = useState(0.0);
  const [servoSprayDuration, setServoSprayDuration] = useState(0.5);
  const [servoDelayAfter, setServoDelayAfter] = useState(0.0);
  const [isLoadingServo, setIsLoadingServo] = useState(false);
  const [servoConfigLoaded, setServoConfigLoaded] = useState(false);
  const [showServoConfigModal, setShowServoConfigModal] = useState(false);
  const [isLoadingServoModal, setIsLoadingServoModal] = useState(false);

  // LED Controller State
  const [ledEnabled, setLedEnabled] = useState(false);
  const [isLoadingLed, setIsLoadingLed] = useState(false);
  const [lastLedUpdate, setLastLedUpdate] = useState<string>("");

  // RTK Injection State — backend-owned profiles; no local runtime authority.
  const [showRTKModal, setShowRTKModal] = useState(false);
  const [rtkHeadline, setRtkHeadline] = useState("Off");
  const [rtkStatusMessage, setRtkStatusMessage] = useState("Idle");
  const [isRTKSubmitting, setIsRTKSubmitting] = useState(false);
  const [canStopRtk, setCanStopRtk] = useState(false);

  // MAVLink Param Browser State
  const [showParamBrowser, setShowParamBrowser] = useState(false);

  // Toast/Success Message State
  const [successMessage, setSuccessMessage] = useState<string>("");

  const refreshSettingsRtkStatus = useCallback(async () => {
    try {
      const rtkStatus = await getRtkStatus();
      const view = toRtkControlView(rtkStatus, {
        connected: connectionState === "connected",
      });
      setRtkHeadline(view.headlineLabel);
      setCanStopRtk(view.canStop);
      setRtkStatusMessage(
        `${view.desiredState ?? "—"} · ${view.managerState ?? "—"} · ${
          view.correctionState ?? "no stream"
        }`,
      );
    } catch {
      setRtkHeadline("Rover Offline");
      setCanStopRtk(false);
      setRtkStatusMessage("Unable to read backend RTK status");
    }
  }, [connectionState]);

  useEffect(() => {
    if (!visible || showRTKModal) {
      return undefined;
    }
    void refreshSettingsRtkStatus();
    return undefined;
  }, [visible, showRTKModal, refreshSettingsRtkStatus]);

  const handleOpenRTKModal = () => {
    setShowRTKModal(true);
  };

  const handleStopRTKStream = async () => {
    setIsRTKSubmitting(true);
    try {
      await stopRtk();
      await refreshSettingsRtkStatus();
    } catch (err) {
      Alert.alert(
        "RTK Stop Failed",
        getRtkFailureMessage(err, "Failed to stop RTK."),
      );
    } finally {
      setIsRTKSubmitting(false);
    }
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
      console.log("[Settings] Loading spray configuration...");

      const response = await getSprayConfig();

      if (!response.success) {
        console.warn("[Settings] Spray config request rejected");
        return;
      }

      const config = response.config;

      setServoEnabled(
        config.available === true && config.fault_latched !== true,
      );

      // Hardware mapping is fixed to AUX5.
      setServoChannel(5);

      if (
        typeof config.press_pwm_us === "number" &&
        Number.isFinite(config.press_pwm_us)
      ) {
        setServoPwmOn(config.press_pwm_us);
      }

      if (
        typeof config.release_pwm_us === "number" &&
        Number.isFinite(config.release_pwm_us)
      ) {
        setServoPwmOff(config.release_pwm_us);
      }

      setServoDelayBefore(0.0);
      setServoDelayAfter(0.0);

      if (
        typeof config.spray_duration_sec === "number" &&
        Number.isFinite(config.spray_duration_sec)
      ) {
        setServoSprayDuration(config.spray_duration_sec);
      }

      setServoConfigLoaded(true);

      console.log("[Settings] Spray config loaded:", {
        available: config.available,

        controllerState: config.controller_state,

        pressPwm: config.press_pwm_us,

        releasePwm: config.release_pwm_us,

        duration: config.spray_duration_sec,

        fault: config.fault_reason,
      });
    } catch (error) {
      console.error("[Settings] Failed to load spray config:", error);

      setServoConfigLoaded(false);
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
      console.log("[Settings] Updating spray PWM:", {
        press_pwm_us: config.servo_pwm_on,

        release_pwm_us: config.servo_pwm_off,
      });

      const response = await setSprayConfig({
        press_pwm_us: Number(config.servo_pwm_on),

        release_pwm_us: Number(config.servo_pwm_off),
      });

      if (!response.success) {
        return {
          success: false,
          message:
            response.message || "Backend rejected spray PWM configuration.",
        };
      }

      const saved = response.config;

      if (typeof saved.press_pwm_us === "number") {
        setServoPwmOn(saved.press_pwm_us);
      }

      if (typeof saved.release_pwm_us === "number") {
        setServoPwmOff(saved.release_pwm_us);
      }

      if (typeof saved.spray_duration_sec === "number") {
        setServoSprayDuration(saved.spray_duration_sec);
      }

      setServoEnabled(saved.available === true && saved.fault_latched !== true);

      setServoChannel(5);

      setSuccessMessage("Spray PWM configuration saved successfully");

      setTimeout(() => setSuccessMessage(""), 3000);

      console.log("[Settings] Spray PWM accepted by controller:", {
        press_pwm_us: saved.press_pwm_us,

        release_pwm_us: saved.release_pwm_us,

        press_value: saved.press_value,

        release_value: saved.release_value,

        result: saved.config_result,
      });

      return {
        success: true,
        message: response.message || "Spray PWM updated successfully.",
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save spray PWM configuration.";

      console.error("[Settings] Spray PWM save failed:", error);

      return {
        success: false,
        message,
      };
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
                  <Text style={styles.settingLabel}>{rtkHeadline}</Text>
                  <Text style={styles.settingDescription}>
                    {rtkStatusMessage}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    canStopRtk ? styles.statusBadgeOn : styles.statusBadgeOff,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {rtkHeadline.toUpperCase()}
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
                    Configure RTK Injection
                  </Text>
                  <Text style={styles.configureButtonDescription}>
                    Backend RTK profiles, activate, start, and stop
                  </Text>
                </View>
                <Text style={styles.configureButtonArrow}>›</Text>
              </TouchableOpacity>

              {canStopRtk && (
                <TouchableOpacity
                  style={[
                    styles.configureButton,
                    { backgroundColor: "#dc2626", marginTop: 12 },
                  ]}
                  onPress={handleStopRTKStream}
                  disabled={isRTKSubmitting}
                >
                  <Text style={styles.configureButtonIcon}>⏹️</Text>
                  <View style={styles.configureButtonContent}>
                    <Text
                      style={[styles.configureButtonTitle, { color: "#fff" }]}
                    >
                      Stop RTK
                    </Text>
                    <Text
                      style={[
                        styles.configureButtonDescription,
                        { color: "#fca5a5" },
                      ]}
                    >
                      Persist STOPPED on the rover
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
                  <Text style={styles.settingLabel}>Spray Controller</Text>

                  <Text style={styles.settingDescription}>
                    AUX5 production spray controller
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    servoEnabled ? styles.statusBadgeOn : styles.statusBadgeOff,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {servoEnabled ? "AVAILABLE" : "OFFLINE"}
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
                      : "Configure AUX5 press and release PWM"}
                  </Text>
                </View>
                <Text style={styles.configureButtonArrow}>›</Text>
              </TouchableOpacity>

              {servoConfigLoaded && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    AUX5 | PRESS: {servoPwmOn} µs | RELEASE: {servoPwmOff} µs
                    {" | "}
                    Spray: {servoSprayDuration.toFixed(2)} s
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

        <RTKInjectionScreen
          visible={showRTKModal}
          onClose={() => {
            setShowRTKModal(false);
            void refreshSettingsRtkStatus();
          }}
          services={services}
          isConnected={connectionState === "connected"}
        />
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
