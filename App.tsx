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

import { initializeBackendURL, setBackendURL } from "./src/config";

import { getSavedBackendURL, saveBackendURL } from "./src/utils/backendStorage";

import type { JetsonDevice } from "./src/utils/jetsonDiscovery";

import RoverDiscoveryScreen from "./src/screens/RoverDiscoveryScreen";
import LoginScreen from "./src/screens/LoginScreen";

import { AUTH_ENABLED } from "./src/config/featureFlags";

GlobalCrashHandler.initialize();

// ── Authentication gate ──────────────────────────────────────────────────────

function AuthGate({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { isAuthenticated, isLoading } = useAuth();

  if (!AUTH_ENABLED) {
    return <>{children}</>;
  }

  if (isLoading) {
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

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <>{children}</>;
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

        setBackendConfigured(Boolean(savedBackendURL));
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
