import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, TouchableWithoutFeedback } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { SettingsScreen } from '../../screens/SettingsScreen';
import { useRover } from '../../context/RoverContext';
import { ModeSelectionDialog } from '../pathplan/ModeSelectionDialog';
import { DashConfigDialog } from '../pathplan/DashConfigDialog';
import { setMissionMode as setBackendMissionMode } from '../../services/missionModeService';
import { LayerControlsPanel } from '../pathplan/LayerControlsPanel';
import {
  MissionProgressPanelKey,
  useMissionProgressOverlayOptional,
} from '../../context/MissionProgressOverlayContext';
import { MISSION_PROGRESS_LAYOUT } from '../../constants/missionProgressLayout';

interface Props {
  activeTab: 'Dashboard' | 'Marking Plan' | 'Mission Progress';
  onTabChange: (tab: 'Dashboard' | 'Marking Plan' | 'Mission Progress') => void;
}

type WidgetMenuItem = {
  key: MissionProgressPanelKey;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const WIDGET_MENU_ITEMS: WidgetMenuItem[] = [
  { key: 'robotStatus', label: 'Robot Status', icon: 'robot' },
  { key: 'missionProgress', label: 'Mission Progress', icon: 'chart-donut' },
  { key: 'distanceToTarget', label: 'Distance to Target', icon: 'crosshairs-gps' },
  { key: 'systemStatus', label: 'System Status', icon: 'pulse' },
  { key: 'missionControls', label: 'Mission Controls', icon: 'rocket-launch' },
  { key: 'bottom', label: 'Mission Points Table', icon: 'table-large' },
];

const VEHICLE_STATUS_CARD_HEIGHT = 345;
const WIDGET_DROPDOWN_TOP = MISSION_PROGRESS_LAYOUT.HEADER_CLEARANCE;
const WIDGET_DROPDOWN_LEFT = MISSION_PROGRESS_LAYOUT.EDGE;

const AppHeaderInner: React.FC<Props> = ({
  activeTab,
  onTabChange,
}) => {
  // Only destructure what AppHeader actually uses — not telemetry.
  // Note: useRover() still triggers re-renders on every telemetry tick because
  // it subscribes to the full context. Phase 2 (context split) will fix this.
  const { missionMode, setMissionMode } = useRover();
  const mpOverlay = useMissionProgressOverlayOptional();
  const showMissionProgressWidget = activeTab === 'Mission Progress' && mpOverlay != null;

  const [showSettings, setShowSettings] = useState(false);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [showDashConfigDialog, setShowDashConfigDialog] = useState(false);

  const getModeIcon = (mode: string): string => {
    switch (mode.toLowerCase()) {
      case 'dgps mark':
        return 'star-three-points-outline';
      case 'interval spray':
        return '💧';
      case 'survey':
        return '🗺️';
      case 'manual control':
        return '🎮';
      case 'custom':
        return '⚙️';
      default:
        return '🎯';
    }
  };

  const handleModeSelect = async (mode: string) => {
    setMissionMode(mode);
    setShowModeDialog(false);

    if (mode === 'Dash') {
      setShowDashConfigDialog(true);
      return;
    }

    let backendMode: 'auto' | 'continuous' | 'dash' = 'auto';
    if (mode === 'Continuous') {
      backendMode = 'continuous';
    }

    try {
      const result = await setBackendMissionMode({ mode: backendMode });
      if (!result.success) {
        console.error('[AppHeader] Failed to set mode:', result.error);
      }
    } catch (error) {
      console.error('[AppHeader] Error setting mode:', error);
    }
  };

  const handleDashConfigConfirm = async (onTime: number, offTime: number) => {
    setShowDashConfigDialog(false);
    try {
      const result = await setBackendMissionMode({
        mode: 'dash',
        dash_servo_on_time: onTime,
        dash_servo_off_time: offTime,
      });
      if (!result.success) {
        console.error('[AppHeader] Failed to set dash mode config:', result.error);
      }
    } catch (error) {
      console.error('[AppHeader] Error setting dash mode config:', error);
    }
  };

  const handleDashConfigCancel = () => {
    setMissionMode('DGPS Mark');
    setShowDashConfigDialog(false);
  };

  const renderTab = (tab: 'Dashboard' | 'Marking Plan' | 'Mission Progress') => {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity
        style={[styles.tab, isActive && styles.tabActive]}
        onPress={() => onTabChange(tab)}
        activeOpacity={0.7}
      >
        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
          {tab}
        </Text>
        {isActive && (
          <View style={styles.activeIndicatorContainer}>
            <View style={styles.activeUnderline} />
          </View>
        )}
      </TouchableOpacity>
    );
  };
  return (
    <View style={styles.header} pointerEvents="box-none">
      {/* Left: branding + Mission Progress widget controller */}
      <View style={styles.headerLeftCluster}>
        <View style={styles.leftSection}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../../../assets/rover-icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <View>
            <Text style={styles.title}>DYX Autonomous</Text>
            <Text style={styles.subtitle}>Way To Mark Robot</Text>
          </View>
        </View>

        {showMissionProgressWidget && (
          <>
            <LayerControlsPanel
              headerAligned
              onToggleWidget={mpOverlay.toggleWidgetMenu}
              isWidgetOpen={mpOverlay.isWidgetMenuOpen}
            />
          </>
        )}
      </View>

      {showMissionProgressWidget && (
        <Modal
          visible={mpOverlay.isWidgetMenuOpen}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={() => mpOverlay.setIsWidgetMenuOpen(false)}
        >
          <TouchableWithoutFeedback onPress={() => mpOverlay.setIsWidgetMenuOpen(false)}>
            <View style={styles.widgetModalBackdrop}>
              <TouchableWithoutFeedback onPress={() => undefined}>
                <View style={styles.widgetDropdownMenu}>
                  <Text style={styles.widgetDropdownTitle}>WIDGET LAYERS</Text>
                  <View style={styles.widgetMenuList}>
                    {WIDGET_MENU_ITEMS.map((item) => {
                      const isSelected = mpOverlay.panelVisibility[item.key];
                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={[
                            styles.widgetMenuItem,
                            isSelected && styles.widgetMenuItemSelected,
                          ]}
                          onPress={() => mpOverlay.togglePanel(item.key)}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons
                            name={item.icon}
                            size={18}
                            color={isSelected ? '#67E8F9' : '#94A3B8'}
                            style={styles.widgetMenuItemIcon}
                          />
                          <Text
                            style={[
                              styles.widgetMenuItemLabel,
                              isSelected && styles.widgetMenuItemLabelSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Center: Tab Navigation Capsule */}
      <View style={styles.centerSection} pointerEvents="box-none">
        <View style={styles.tabContainer}>
          {renderTab('Dashboard')}
          {renderTab('Marking Plan')}
          {renderTab('Mission Progress')}
        </View>
      </View>

      {/* Right: Settings and Mode Unified Capsule */}
      <View style={styles.rightSection}>
        {/* Mode Selector Button */}
        <TouchableOpacity
          onPress={() => setShowModeDialog(true)}
          style={styles.modeCapsuleBtn}
          activeOpacity={0.7}
          accessibilityLabel="Change mission mode"
          accessibilityRole="button"
        >
          <Text style={styles.modeCapsuleLabel}>MODE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
            <MaterialCommunityIcons name="near-me" size={12} color="#67E8F9" />
            <Text style={styles.modeCapsuleValue}>{missionMode}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.rightDivider} />

        {/* Settings Button */}
        <TouchableOpacity
          onPress={() => setShowSettings(true)}
          style={styles.settingsCapsuleBtn}
          accessibilityLabel="Open settings"
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="cog-outline" size={18} color="#E5F1FF" />
        </TouchableOpacity>
      </View>

      {/* Settings Screen Modal */}
      <SettingsScreen visible={showSettings} onClose={() => setShowSettings(false)} />

      {/* Mode Selection Dialog */}
      <ModeSelectionDialog
        visible={showModeDialog}
        currentMode={missionMode}
        onSelectMode={handleModeSelect}
        onCancel={() => setShowModeDialog(false)}
      />

      {/* Dash Config Dialog */}
      <DashConfigDialog
        visible={showDashConfigDialog}
        initialDistance={5.0}
        initialGap={3.0}
        onConfirm={handleDashConfigConfirm}
        onCancel={handleDashConfigCancel}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    height: 58,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1000,
  },
  headerLeftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    zIndex: 1002,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#07111be6',
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.15)',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  logoContainer: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  logoImage: {
    width: 28,
    height: 28,
  },
  title: {
    color: '#E5F1FF',
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9FBEE3',
    fontSize: 8,
    fontWeight: '500',
    marginTop: 0,
  },
  centerSection: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#07111be6',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.15)',
    padding: 2,
    pointerEvents: 'auto',
    height: 48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  tab: {
    paddingHorizontal: 20,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: 'rgba(103, 232, 249, 0.08)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#67E8F9',
  },
  activeIndicatorContainer: {
    position: 'absolute',
    bottom: 3,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  activeUnderline: {
    width: 14,
    height: 2.5,
    backgroundColor: '#67E8F9',
    borderRadius: 1.25,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#07111be6',
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.15)',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  modeCapsuleBtn: {
    justifyContent: 'center',
    paddingRight: 8,
  },
  modeCapsuleLabel: {
    color: '#94A3B8',
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  modeCapsuleValue: {
    color: '#E5F1FF',
    fontSize: 11,
    fontWeight: '700',
  },
  rightDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(103, 232, 249, 0.15)',
    marginHorizontal: 4,
  },
  settingsCapsuleBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  widgetModalBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  widgetDropdownMenu: {
    position: 'absolute',
    top: WIDGET_DROPDOWN_TOP,
    left: WIDGET_DROPDOWN_LEFT,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,
    height: VEHICLE_STATUS_CARD_HEIGHT,
    zIndex: 1002,
    backgroundColor: '#07111be6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.15)',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  widgetDropdownTitle: {
    color: '#67E8F9',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingBottom: 10,
  },
  widgetMenuList: {
    flex: 1,
    gap: 8,
  },
  widgetMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.1)',
    backgroundColor: 'rgba(8, 16, 26, 0.9)',
    paddingHorizontal: 12,
  },
  widgetMenuItemSelected: {
    borderColor: 'rgba(103, 232, 249, 0.55)',
    backgroundColor: 'rgba(103, 232, 249, 0.14)',
  },
  widgetMenuItemIcon: {
    marginRight: 10,
  },
  widgetMenuItemLabel: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  widgetMenuItemLabelSelected: {
    color: '#67E8F9',
  },
});

// Memoize AppHeader to prevent unnecessary re-renders from parent.
// Note: This cannot prevent context-driven re-renders from useRover().
// Phase 2 (context split) is needed to fully isolate AppHeader from 20Hz telemetry.
export const AppHeader = React.memo(AppHeaderInner);
