import React, { useEffect, useState } from "react";

import { ActivityIndicator, StatusBar, View } from "react-native";

import { NavigationContainer } from "@react-navigation/native";

import { GestureHandlerRootView } from "react-native-gesture-handler";

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

import { initializeBackendURL, setBackendURL } from "./src/config";

import { PX4_AUTH } from "./src/config/px4Endpoints";

import { getSavedBackendURL, saveBackendURL } from "./src/utils/backendStorage";

import type { JetsonDevice } from "./src/utils/jetsonDiscovery";

import RoverDiscoveryScreen from "./src/screens/RoverDiscoveryScreen";
import LoginScreen from "./src/screens/LoginScreen";

import { AUTH_ENABLED } from "./src/config/featureFlags";

GlobalCrashHandler.initialize();

type SessionValidationState = "checking" | "valid" | "invalid";

// ── Authentication gate ──────────────────────────────────────────────────────

function AuthGate({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { isAuthenticated, isLoading, session, invalidateSession } = useAuth();
  const [sessionValidation, setSessionValidation] =
    useState<SessionValidationState>(AUTH_ENABLED ? "checking" : "valid");

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
      return;
    }

    if (isLoading) {
      setSessionValidation("checking");
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
      } finally {
        validationInFlight = false;
      }
    };

    setSessionValidation("checking");
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

  if (isLoading || (isAuthenticated && sessionValidation === "checking")) {
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

  if (!isAuthenticated || sessionValidation === "invalid") {
    return <LoginScreen />;
  }

  return (
    <React.Fragment key={session?.token ?? "authenticated-session"}>
      {children}
    </React.Fragment>
  );
}

// ── Main application content ─────────────────────────────────────────────────

function AppContent(): React.ReactElement {
  useImmersiveMode();

  const [backendReady, setBackendReady] = useState(false);

  const [backendConfigured, setBackendConfigured] = useState(false);

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
        setBackendConfigured(Boolean(configuredURL) && !isPlaceholderBackend);
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

    setBackendConfigured(true);
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
  if (!backendConfigured) {
    return <RoverDiscoveryScreen onRoverSelected={handleRoverSelected} />;
  }

  return (
    <AuthGate>
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
    return null;
  }

  return (
    <ErrorBoundary componentName="App Root">
      <GestureHandlerRootView
        style={{
          flex: 1,
        }}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0A1628" hidden />

        <ComponentReadinessProvider>
          <AuthProvider>
            <ErrorBoundary componentName="Main Content">
              <AppContent />
            </ErrorBoundary>
          </AuthProvider>
        </ComponentReadinessProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
