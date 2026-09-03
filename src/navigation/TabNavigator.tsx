import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import DashboardScreen from '../screens/DashboardScreen';
import PathPlanScreen from '../screens/PathPlanScreen';
import MissionReportScreen from '../screens/MissionReportScreen';
import { AppHeader } from '../components/shared/AppHeader';
import { MissionProgressOverlayProvider } from '../context/MissionProgressOverlayContext';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';
import { colors } from '../theme/colors';
import PersistentStorage from '../services/PersistentStorage';
import { useRover } from '../context/RoverContext';

export default function TabNavigator() {
  const { missionMode } = useRover();
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Marking Plan' | 'Mission Progress'>('Mission Progress');
  // Keep ALL visited tabs mounted — never unmount them.
  // This prevents WebView recreation (the #1 cause of tab switch lag).
  // Leaflet maps are paused via isVisible prop when hidden.
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['Mission Progress']));
  const [isLoadingTab, setIsLoadingTab] = useState(true);
  const previousTabRef = useRef<string>('Mission Progress');
  const mountedRef = useRef(true);

  // Load last active tab on mount - restore where user left off
  useEffect(() => {
    const loadLastActiveTab = async () => {
      try {
        const lastTab = await PersistentStorage.loadActiveTab();
        if (lastTab && (lastTab === 'Dashboard' || lastTab === 'Marking Plan' || lastTab === 'Mission Progress')) {
          console.log('[TabNavigator] 📂 Restoring last active tab:', lastTab);
          setActiveTab(lastTab as 'Dashboard' | 'Marking Plan' | 'Mission Progress');
          setMountedTabs(new Set([lastTab]));
          previousTabRef.current = lastTab;
        } else {
          console.log('[TabNavigator] No saved tab found, defaulting to Mission Progress');
        }
      } catch (error) {
        console.error('[TabNavigator] Failed to load last active tab:', error);
      } finally {
        setIsLoadingTab(false);
      }
    };

    loadLastActiveTab();
  }, []);

  // Handle tab changes — keep all tabs mounted, just toggle visibility
  const handleTabChange = useCallback((newTab: 'Dashboard' | 'Marking Plan' | 'Mission Progress') => {
    if (!mountedRef.current) {
      console.warn('[TabNavigator] Component unmounted, ignoring tab change');
      return;
    }

    if (activeTab === newTab) {
      return;
    }

    console.log(`[TabNavigator] Switching from "${previousTabRef.current}" to "${newTab}"`);

    // Mark new tab as mounted (if not already)
    setMountedTabs(prev => {
      if (prev.has(newTab)) return prev;
      return new Set(prev).add(newTab);
    });
    setActiveTab(newTab);

    // Save active tab for restoration after crash/restart
    PersistentStorage.saveActiveTab(newTab).catch(error => {
      console.error('[TabNavigator] Failed to save active tab:', error);
    });

    previousTabRef.current = newTab;
    // NOTE: No unmount timer! Tabs stay mounted with display:none.
    // Leaflet maps are paused/resumed via the isVisible prop.
  }, [activeTab]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      console.log('[TabNavigator] Component unmounting, cleaning up all tabs');
      setMountedTabs(new Set());
    };
  }, []);

  const [isDrawingToolsVisible, setIsDrawingToolsVisible] = useState(true);
  const [isMissionOpsVisible, setIsMissionOpsVisible] = useState(true);
  const [isStatisticsVisible, setIsStatisticsVisible] = useState(true);
  const [isBottomTableVisible, setIsBottomTableVisible] = useState(true);

  const isMarkingPlanVisible = activeTab === 'Marking Plan';
  const isMissionProgressVisible = activeTab === 'Mission Progress';

  return (
    <MissionProgressOverlayProvider>
    <View style={{ flex: 1, backgroundColor: colors.primary }}>
      {/* Custom Header with Integrated Tabs */}
      <AppHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Screen Content — all visited tabs stay mounted, hidden ones use display:none */}
      {mountedTabs.has('Dashboard') && (
        <View style={{ flex: 1, display: activeTab === 'Dashboard' ? 'flex' : 'none' }}>
          <ErrorBoundary componentName="Dashboard Screen">
            <DashboardScreen />
          </ErrorBoundary>
        </View>
      )}
      {mountedTabs.has('Marking Plan') && (
        <View style={{ flex: 1, display: isMarkingPlanVisible ? 'flex' : 'none' }}>
          <ErrorBoundary componentName="Marking Plan Screen">
            <PathPlanScreen 
              isVisible={isMarkingPlanVisible} 
              isDrawingToolsVisible={isDrawingToolsVisible}
              setIsDrawingToolsVisible={setIsDrawingToolsVisible}
              isMissionOpsVisible={isMissionOpsVisible}
              setIsMissionOpsVisible={setIsMissionOpsVisible}
              isStatisticsVisible={isStatisticsVisible}
              setIsStatisticsVisible={setIsStatisticsVisible}
              isBottomTableVisible={isBottomTableVisible}
              setIsBottomTableVisible={setIsBottomTableVisible}
            />
          </ErrorBoundary>
        </View>
      )}
      {mountedTabs.has('Mission Progress') && (
        <View style={{ flex: 1, display: isMissionProgressVisible ? 'flex' : 'none' }}>
          <ErrorBoundary componentName="Mission Progress Screen">
            <MissionReportScreen isVisible={isMissionProgressVisible} />
          </ErrorBoundary>
        </View>
      )}
    </View>
    </MissionProgressOverlayProvider>
  );
}