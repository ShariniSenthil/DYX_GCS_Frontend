import { useEffect, useState } from 'react';
import { StatusBar, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

/**
 * Custom hook to manage immersive mode (fullscreen)
 * Automatically hides status bar and navigation bar on mount
 * Based on crash native implementation
 */
export const useImmersiveMode = () => {
  const [isImmersive, setIsImmersive] = useState(true); // Start in immersive mode

  // Apply immersive mode settings
  const applyImmersiveMode = async (enable: boolean) => {
    try {
      if (enable) {
        // Hide status bar with animation
        StatusBar.setHidden(true, 'fade');

        // Android: Hide navigation bar in leanback mode
        if (Platform.OS === 'android') {
          await NavigationBar.setVisibilityAsync('hidden');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
          await NavigationBar.setBackgroundColorAsync('#000000');
        }

        console.log('[ImmersiveMode] Enabled - Status bar and navigation bar hidden');
      } else {
        // Show status bar with animation
        StatusBar.setHidden(false, 'fade');

        // Android: Show navigation bar
        if (Platform.OS === 'android') {
          await NavigationBar.setVisibilityAsync('visible');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
          await NavigationBar.setBackgroundColorAsync('#0A1628'); // Match app theme
        }

        console.log('[ImmersiveMode] Disabled - Status bar and navigation bar visible');
      }

      setIsImmersive(enable);
    } catch (error) {
      console.error('[ImmersiveMode] Error:', error);
    }
  };

  // Toggle immersive mode
  const toggleImmersiveMode = () => {
    applyImmersiveMode(!isImmersive);
  };

  // Auto-enable immersive mode on mount (like crash native)
  useEffect(() => {
    applyImmersiveMode(true);

    // Cleanup on unmount - restore normal mode
    return () => {
      StatusBar.setHidden(false, 'none');
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync('visible').catch(() => {});
      }
    };
  }, []);

  return {
    isImmersive,
    toggleImmersiveMode,
    setImmersiveMode: applyImmersiveMode,
  };
};
