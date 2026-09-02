import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import DashboardScreen from '../screens/DashboardScreen';
import PathPlanScreen from '../screens/PathPlanScreen';
import MissionReportScreen from '../screens/MissionReportScreen';
import { AppHeader } from '../components/shared/AppHeader';
import { FieldMapHost } from '../components/shared/FieldMapHost';
import { MissionProgressOverlayProvider } from '../context/MissionProgressOverlayContext';
import { FieldMapProvider, useFieldMap } from '../context/FieldMapContext';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';
import { colors } from '../theme/colors';
import PersistentStorage from '../services/PersistentStorage';

const MemoDashboardScreen = React.memo(DashboardScreen);
const MemoPathPlanScreen = React.memo(PathPlanScreen);
const MemoMissionReportScreen = React.memo(MissionReportScreen);

type TabName = 'Dashboard' | 'Marking Plan' | 'Mission Progress';

const MAP_TABS: TabName[] = ['Marking Plan', 'Mission Progress'];

function TabNavigatorInner() {
  const [activeTab, setActiveTab] = useState<TabName>('Mission Progress');
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(
    new Set(MAP_TABS),
  );
  const previousTabRef = useRef<string>('Mission Progress');
  const mountedRef = useRef(true);
  const { setActiveSurface } = useFieldMap();

  useEffect(() => {
    const loadLastActiveTab = async () => {
      try {
        const lastTab = await PersistentStorage.loadActiveTab();
        if (lastTab === 'Dashboard' || lastTab === 'Marking Plan' || lastTab === 'Mission Progress') {
          setActiveTab(lastTab);
          setMountedTabs((prev) => {
            const next = new Set(prev);
            next.add(lastTab);
            if (lastTab !== 'Dashboard') {
              MAP_TABS.forEach((tab) => next.add(tab));
            }
            return next;
          });
          previousTabRef.current = lastTab;
        }
      } catch (error) {
        console.error('[TabNavigator] Failed to load last active tab:', error);
      }
    };

    loadLastActiveTab();
  }, []);

  useEffect(() => {
    if (activeTab === 'Marking Plan') setActiveSurface('marking');
    else if (activeTab === 'Mission Progress') setActiveSurface('mission');
  }, [activeTab, setActiveSurface]);

  const handleTabChange = useCallback((newTab: TabName) => {
    if (!mountedRef.current || activeTab === newTab) {
      return;
    }

    setMountedTabs((prev) => {
      const next = new Set(prev).add(newTab);
      if (newTab === 'Marking Plan' || newTab === 'Mission Progress') {
        MAP_TABS.forEach((tab) => next.add(tab));
      }
      return next;
    });
    setActiveTab(newTab);

    PersistentStorage.saveActiveTab(newTab).catch((error) => {
      console.error('[TabNavigator] Failed to save active tab:', error);
    });

    previousTabRef.current = newTab;
  }, [activeTab]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [isDrawingToolsVisible, setIsDrawingToolsVisible] = useState(true);
  const [isMissionOpsVisible, setIsMissionOpsVisible] = useState(true);
  const [isStatisticsVisible, setIsStatisticsVisible] = useState(true);
  const [isBottomTableVisible, setIsBottomTableVisible] = useState(true);

  const isMarkingPlanVisible = activeTab === 'Marking Plan';
  const isMissionProgressVisible = activeTab === 'Mission Progress';
  const mapTabActive = isMarkingPlanVisible || isMissionProgressVisible;

  return (
    <MissionProgressOverlayProvider>
      <View style={styles.root}>
        <AppHeader
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />

        <View style={styles.body}>
          <View
            style={styles.mapHost}
            pointerEvents={mapTabActive ? 'auto' : 'none'}
            collapsable={false}
          >
            <ErrorBoundary componentName="Field Map">
              <FieldMapHost />
            </ErrorBoundary>
          </View>

          {mountedTabs.has('Dashboard') && (
            <View
              style={[
                styles.screen,
                { display: activeTab === 'Dashboard' ? 'flex' : 'none' },
              ]}
              collapsable={false}
            >
              <ErrorBoundary componentName="Dashboard Screen">
                <MemoDashboardScreen />
              </ErrorBoundary>
            </View>
          )}

          {mountedTabs.has('Marking Plan') && (
            <View
              style={[
                styles.overlayScreen,
                { display: isMarkingPlanVisible ? 'flex' : 'none' },
              ]}
              pointerEvents={isMarkingPlanVisible ? 'box-none' : 'none'}
              collapsable={false}
            >
              <ErrorBoundary componentName="Marking Plan Screen">
                <MemoPathPlanScreen
                  embedMap={false}
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
            <View
              style={[
                styles.overlayScreen,
                { display: isMissionProgressVisible ? 'flex' : 'none' },
              ]}
              pointerEvents={isMissionProgressVisible ? 'box-none' : 'none'}
              collapsable={false}
            >
              <ErrorBoundary componentName="Mission Progress Screen">
                <MemoMissionReportScreen
                  embedMap={false}
                  isVisible={isMissionProgressVisible}
                />
              </ErrorBoundary>
            </View>
          )}
        </View>
      </View>
    </MissionProgressOverlayProvider>
  );
}

export default function TabNavigator() {
  return (
    <FieldMapProvider>
      <TabNavigatorInner />
    </FieldMapProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  body: {
    flex: 1,
    position: 'relative',
  },
  mapHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: colors.primary,
  },
  overlayScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
});
