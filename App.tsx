import React, { useEffect, useRef, useState } from "react";

import { ActivityIndicator, StatusBar, StyleSheet, View } from "react-native";

import { NavigationContainer } from "@react-navigation/native";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { SafeAreaProvider } from "react-native-safe-area-context";

import { useFonts } from "expo-font";

import {
  Fontisto,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";

import TabNavigator from "./src/navigation/TabNavigator";

import { RoverProvider } from "./src/context/RoverContext";

import { WaypointProvider } from "./src/context/WaypointContext";

import { ComponentReadinessProvider } from "./src/context/ComponentReadinessContext";

import { AuthProvider } from "./src/context/AuthContext";

import { MissionStagingProvider } from "./src/context/MissionStagingContext";

import { VerifiedMissionProvider } from "./src/context/VerifiedMissionContext";

import { ErrorBoundary } from "./src/components/shared/ErrorBoundary";

import { useImmersiveMode } from "./src/hooks/useImmersiveMode";

import { useAuth } from "./src/hooks/useAuth";

import GlobalCrashHandler from "./src/services/GlobalCrashHandler";

import { apiGet } from "./src/services/apiClient";

import { UnauthorizedError } from "./src/services/apiError";

import { initializeBackendURL, isMetroBundlerUrl, setBackendURL } from "./src/config";

import { PX4_AUTH } from "./src/config/px4Endpoints";

import {
  clearBackendURL,
  getSavedBackendURL,
  saveBackendURL,
} from "./src/utils/backendStorage";

import type { JetsonDevice } from "./src/utils/jetsonDiscovery";

import RoverDiscoveryScreen from "./src/screens/RoverDiscoveryScreen";
import LoginScreen from "./src/screens/LoginScreen";

import { AUTH_ENABLED } from "./src/config/featureFlags";

GlobalCrashHandler.initialize();

type SessionValidationState = "checking" | "valid" | "invalid";

// ── Authentication gate ──────────────────────────────────────────────────────

function AuthGate({
  children,
  onBackToDiscovery,
}: {
  children: React.ReactNode;
  /**
   * Optional escape hatch rendered on the LoginScreen that returns the
   * operator to the RoverDiscoveryScreen. Omitted when the login screen
   * is used as a forced re-authentication overlay.
   */
  onBackToDiscovery?: () => void;
}): React.ReactElement {
  const { isAuthenticated, isLoading, session, invalidateSession } = useAuth();
  const [sessionValidation, setSessionValidation] =
    useState<SessionValidationState>(AUTH_ENABLED ? "checking" : "valid");
  const validatedOnceRef = useRef(!AUTH_ENABLED);

  /**
   * Validate the saved token against the selected rover.
   *
   * Previously a stale token remained locally authenticated, so Socket.IO kept
   * reconnecting with a rejected token until the operator explicitly logged out
   * and logged in again. A real 401 now opens Login directly. Temporary network
   * or Jetson startup failures never force logout and are retried later.
   */
  useEffect(() => {
    if (!AUTH_ENABLED) {
      setSessionValidation("valid");
      validatedOnceRef.current = true;
      return;
    }

    if (isLoading) {
      if (!validatedOnceRef.current) {
        setSessionValidation("checking");
      }
      return;
    }

    if (!session?.token) {
      setSessionValidation("invalid");
      return;
    }

    let mounted = true;
    let validationInFlight = false;

    const validateStoredSession = async (): Promise<void> => {
      if (validationInFlight) {
        return;
      }

      validationInFlight = true;

      try {
        await apiGet(PX4_AUTH.SESSION, {
          timeoutMs: 8_000,
          // Explicit header avoids a startup race with AuthContext token setup.
          headers: {
            "X-Rover-Token": session.token,
          },
        });

        if (mounted) {
          setSessionValidation("valid");
          validatedOnceRef.current = true;
        }
      } catch (error) {
        if (!mounted) {
          return;
        }

        if (error instanceof UnauthorizedError) {
          console.warn("[AuthGate] Saved backend session was rejected.");

          setSessionValidation("invalid");

          await invalidateSession(
            "The saved rover login is no longer valid. Please log in again.",
          );

          return;
        }

        console.warn(
          "[AuthGate] Session validation deferred until backend is reachable:",
          error,
        );
        setSessionValidation("valid");
        validatedOnceRef.current = true;
      } finally {
        validationInFlight = false;
      }
    };

    if (!validatedOnceRef.current) {
      setSessionValidation("checking");
    }
    void validateStoredSession();

    // Detect server-side token invalidation while the app remains open.
    const validationTimer = setInterval(() => {
      void validateStoredSession();
    }, 30_000);

    return () => {
      mounted = false;
      clearInterval(validationTimer);
    };
  }, [isLoading, session?.token, invalidateSession]);

  if (!AUTH_ENABLED) {
    return <>{children}</>;
  }

  const showBootstrapSpinner =
    isLoading ||
    (!validatedOnceRef.current &&
      isAuthenticated &&
      sessionValidation === "checking");

  const showLogin = !isAuthenticated || sessionValidation === "invalid";

  const coverGcs = showBootstrapSpinner || showLogin;

  return (
    <View style={styles.fill}>
      <View
        style={[styles.fill, coverGcs && styles.gcsParked]}
        pointerEvents={coverGcs ? "none" : "auto"}
        collapsable={false}
      >
        {children}
      </View>
      {showBootstrapSpinner ? (
        <View style={styles.blockingOverlayCentered}>
          <ActivityIndicator size="large" color="#4ADE80" />
        </View>
      ) : showLogin ? (
        <View style={styles.blockingOverlay}>
          <LoginScreen onBack={onBackToDiscovery} />
        </View>
      ) : null}
    </View>
  );
}

// ── Main application content ─────────────────────────────────────────────────

function AppContent(): React.ReactElement {
  useImmersiveMode();

  const [backendReady, setBackendReady] = useState(false);

  const [backendConfigured, setBackendConfigured] = useState(false);
  const [gcsMounted, setGcsMounted] = useState(false);

  /**
   * Restore the previously selected rover.
   *
   * When a saved backend URL exists, discovery is skipped and the application
   * proceeds directly to the authentication gate.
   *
   * The saved login session is restored independently by AuthProvider.
   */
  useEffect(() => {
    let mounted = true;

    const initializeApplication = async (): Promise<void> => {
      try {
        await initializeBackendURL();

        const savedBackendURL = await getSavedBackendURL();

        if (!mounted) {
          return;
        }

        // `Continue Offline` stores a localhost placeholder so the app can
        // render without a rover. It must never be treated as a real rover
        // on the next cold start, otherwise users are sent straight to the
        // login screen for an unreachable localhost backend.
        const configuredURL = savedBackendURL?.trim() ?? "";
        const isPlaceholderBackend = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\\d+)?\/?$/i.test(configuredURL);
        const hasRover =
          Boolean(configuredURL) &&
          !isPlaceholderBackend &&
          !isMetroBundlerUrl(configuredURL);
        setBackendConfigured(hasRover);
        if (hasRover) {
          setGcsMounted(true);
        }
      } catch (error) {
        console.warn("[App] Could not restore saved backend:", error);

        if (mounted) {
          setBackendConfigured(false);
        }
      } finally {
        if (mounted) {
          setBackendReady(true);
        }
      }
    };

    void initializeApplication();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Called after the operator selects and connects to a rover.
   */
  const handleRoverSelected = async (device: JetsonDevice): Promise<void> => {
    setBackendURL(device.url);

    await saveBackendURL(device.url, device.ip, device.port);

    setGcsMounted(true);
    setBackendConfigured(true);
  };

  /**
   * Called from the LoginScreen "Back to Rovers" button.
   *
   * Clears the persisted rover selection and resets the in-memory backend
   * URL to the same state as a fresh start, so the operator returns to the
   * RoverDiscoveryScreen. The saved login session is intentionally kept —
   * only explicit Logout removes it. If the operator then connects to a
   * different rover, the ConnectPasswordModal login replaces the token.
   */
  const handleBackToDiscovery = async (): Promise<void> => {
    try {
      await clearBackendURL();
    } catch (error) {
      console.warn("[App] Could not clear saved backend URL:", error);
    } finally {
      // initializeBackendURL never throws; with nothing saved it restores
      // the default URL, exactly matching a first-launch state.
      await initializeBackendURL();
      setBackendConfigured(false);
    }
  };

  if (!backendReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0A1628",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color="#4ADE80" />
      </View>
    );
  }

  /**
   * Discovery is shown only when the application has never saved a rover URL.
   *
   * After the first successful rover connection:
   * - App closure skips discovery.
   * - Tablet restart skips discovery.
   * - Wi-Fi loss does not reopen discovery.
   * - Jetson restart does not reopen discovery.
   */
  const showDiscovery = !backendConfigured;

  return (
    <View style={styles.fill}>
      {gcsMounted ? (
        <View
          style={[styles.fill, showDiscovery && styles.gcsParked]}
          pointerEvents={showDiscovery ? "none" : "auto"}
          collapsable={false}
        >
          <AuthGate onBackToDiscovery={handleBackToDiscovery}>
            <WaypointProvider>
              <VerifiedMissionProvider>
                <MissionStagingProvider>
                  <RoverProvider>
                    <NavigationContainer>
                      <TabNavigator />
                    </NavigationContainer>
                  </RoverProvider>
                </MissionStagingProvider>
              </VerifiedMissionProvider>
            </WaypointProvider>
          </AuthGate>
        </View>
      ) : null}
      {showDiscovery ? (
        <View style={styles.blockingOverlay}>
          <RoverDiscoveryScreen onRoverSelected={handleRoverSelected} />
        </View>
      ) : null}
    </View>
  );
}

// ── Application root ─────────────────────────────────────────────────────────

export default function App(): React.ReactElement | null {
  const [fontsLoaded] = useFonts({
    ...Fontisto.font,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    ...MaterialIcons.font,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.blockingOverlayCentered}>
        <ActivityIndicator size="large" color="#4ADE80" />
      </View>
    );
  }

  return (
    <ErrorBoundary componentName="App Root">
      <GestureHandlerRootView
        style={{
          flex: 1,
        }}
      >
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" backgroundColor="#0A1628" hidden />

          <ComponentReadinessProvider>
            <AuthProvider>
              <ErrorBoundary componentName="Main Content">
                <AppContent />
              </ErrorBoundary>
            </AuthProvider>
          </ComponentReadinessProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: "#0A1628",
  },
  /**
   * Keep MapView mounted (no display:none / unmount) but invisible so
   * Marking Plan zIndex/elevation cannot punch through Discovery or Login.
   */
  gcsParked: {
    opacity: 0,
  },
  blockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0A1628",
    zIndex: 100000,
    elevation: 100000,
  },
  blockingOverlayCentered: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0A1628",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100000,
    elevation: 100000,
  },
});
