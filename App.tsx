import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import TabNavigator from './src/navigation/TabNavigator';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RoverProvider } from './src/context/RoverContext';
import { WaypointProvider } from './src/context/WaypointContext';
import { ComponentReadinessProvider } from './src/context/ComponentReadinessContext';
import { AuthProvider } from './src/context/AuthContext';
import { MissionStagingProvider } from './src/context/MissionStagingContext';
import { VerifiedMissionProvider } from './src/context/VerifiedMissionContext';
import { ErrorBoundary } from './src/components/shared/ErrorBoundary';
import { useImmersiveMode } from './src/hooks/useImmersiveMode';
import { useAuth } from './src/hooks/useAuth';

import GlobalCrashHandler from './src/services/GlobalCrashHandler';
import { setBackendURL, initializeBackendURL } from './src/config';
import { saveBackendURL } from './src/utils/backendStorage';
import { JetsonDevice } from './src/utils/jetsonDiscovery';
import RoverDiscoveryScreen from './src/screens/RoverDiscoveryScreen';
import LoginScreen from './src/screens/LoginScreen';
import { useFonts } from 'expo-font';
import { Fontisto, Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { AUTH_ENABLED } from './src/config/featureFlags';

GlobalCrashHandler.initialize();

/**
 * AuthGate — renders LoginScreen when not authenticated, children otherwise.
 * Only active when AUTH_ENABLED=true (4WD_SERVER mode).
 */
function AuthGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const { isAuthenticated, isLoading } = useAuth();

  if (!AUTH_ENABLED) {
    return React.createElement(React.Fragment, null, children);
  }

  if (isLoading) {
    // Brief loading while AsyncStorage session is resolved
    return (
      <View style={{ flex: 1, backgroundColor: '#0A1628', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4ADE80" />
      </View>
    );
  }

  if (!isAuthenticated) {
    // Past rover discovery — session expired mid-mission
    return React.createElement(LoginScreen, { isReAuth: true });
  }

  return React.createElement(React.Fragment, null, children);
}

function AppContent() {
  useImmersiveMode();
  const [backendConfigured, setBackendConfigured] = useState(false);
  const [backendReady, setBackendReady] = useState(false);

  // Resolve storage before first paint; discovery always runs on cold launch.
  useEffect(() => {
    initializeBackendURL().then(() => {
      setBackendReady(true);
    });
  }, []);

  const handleRoverSelected = async (device: JetsonDevice) => {
    // MUST call setBackendURL synchronously BEFORE setBackendConfigured(true)
    // so that when RoverProvider mounts it reads the correct URL
    setBackendURL(device.url);
    await saveBackendURL(device.url, device.ip, device.port);
    setBackendConfigured(true);
  };

  // Show nothing until AsyncStorage URL is resolved
  if (!backendReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A1628' }} />
    );
  }

  // Discovery — RoverProvider is NOT mounted here, so no socket is created yet
  if (!backendConfigured) {
    return <RoverDiscoveryScreen onRoverSelected={handleRoverSelected} />;
  }

  // RoverProvider mounts fresh NOW — getBackendURL() already returns the rover URL
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

export default function App() {
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
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="#0A1628" hidden={true} />
        <ComponentReadinessProvider>
          {/* AuthProvider wraps everything so apiClient and socketClient
              have a token getter available from the earliest mount */}
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
