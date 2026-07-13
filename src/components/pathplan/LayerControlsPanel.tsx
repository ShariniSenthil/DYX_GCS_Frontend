import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/** Matches AppHeader `leftSection` / `tabContainer` chrome height */
export const HEADER_CONTROL_HEIGHT = 48;

interface LayerControlsPanelProps {
  onToggleSettings?: () => void;
  onToggleWidget?: () => void;
  isSettingsOpen?: boolean;
  isWidgetOpen?: boolean;
  /** When true, capsule height matches AppHeader left section (48px). */
  headerAligned?: boolean;
}

export const LayerControlsPanel: React.FC<LayerControlsPanelProps> = ({
  onToggleSettings,
  onToggleWidget,
  isSettingsOpen = false,
  isWidgetOpen = false,
  headerAligned = false,
}) => {
  return (
    <View style={styles.container}>
      <View style={[styles.capsule, headerAligned && styles.capsuleHeader]}>
        {onToggleSettings && (
        <TouchableOpacity
          style={[
            styles.capsuleBtn,
            headerAligned && styles.capsuleBtnHeader,
            isSettingsOpen && styles.capsuleBtnActive,
          ]}
          onPress={onToggleSettings}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="cog" size={18} color={isSettingsOpen ? '#67E8F9' : '#E5F1FF'} />
          <Text
            style={[styles.capsuleBtnText, isSettingsOpen && styles.capsuleBtnTextActive]}
            numberOfLines={2}
          >
            Layer Settings
          </Text>
        </TouchableOpacity>
        )}

        {onToggleSettings && onToggleWidget && (
          <View style={[styles.divider, headerAligned && styles.dividerHeader]} />
        )}

        {onToggleWidget && (
        <TouchableOpacity
          style={[
            styles.capsuleBtn,
            headerAligned && styles.capsuleBtnHeader,
            isWidgetOpen && styles.capsuleBtnActive,
          ]}
          onPress={onToggleWidget}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="view-dashboard"
            size={18}
            color={isWidgetOpen ? '#67E8F9' : '#E5F1FF'}
          />
          <Text
            style={[
              styles.capsuleBtnText,
              headerAligned && styles.capsuleBtnTextHeader,
              isWidgetOpen && styles.capsuleBtnTextActive,
            ]}
            numberOfLines={2}
          >
            Widget{'\n'}Controller
          </Text>
        </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    width: 60,
    alignItems: 'center',
  },
  capsule: {
    backgroundColor: '#07111be6',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.15)',
    paddingVertical: 6,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  capsuleHeader: {
    height: HEADER_CONTROL_HEIGHT,
    paddingVertical: 0,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 5,
  },
  capsuleBtn: {
    width: 52,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'column',
  },
  capsuleBtnHeader: {
    height: HEADER_CONTROL_HEIGHT,
  },
  capsuleBtnActive: {
    backgroundColor: 'rgba(103, 232, 249, 0.12)',
    borderWidth: 1,
    borderColor: '#67E8F9',
  },
  capsuleBtnText: {
    fontSize: 7,
    lineHeight: 8,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 3,
    textAlign: 'center',
  },
  capsuleBtnTextHeader: {
    marginTop: 2,
  },
  capsuleBtnTextActive: {
    color: '#67E8F9',
  },
  divider: {
    width: '60%',
    height: 1,
    backgroundColor: 'rgba(103, 232, 249, 0.1)',
    marginVertical: 4,
  },
  dividerHeader: {
    marginVertical: 0,
  },
});
