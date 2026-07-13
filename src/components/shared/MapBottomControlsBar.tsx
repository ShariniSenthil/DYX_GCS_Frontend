import React from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PATH_PLAN_GLASS } from '../../constants/pathPlanGlass';

export type MapStyleMode = 'satellite' | 'streets' | 'dark';

// Icon shown on the toggle for each basemap mode
const MAP_STYLE_ICON: Record<MapStyleMode, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  satellite: 'image-filter-hdr',
  streets: 'road-variant',
  dark: 'earth',
};

interface Props {
  mapStyle: MapStyleMode;
  onToggleMapStyle: () => void;
  onFitMission: () => void;
  onCenterRover: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const MapBottomControlsBar: React.FC<Props> = ({
  mapStyle,
  onToggleMapStyle,
  onFitMission,
  onCenterRover,
  onZoomIn,
  onZoomOut,
  disabled = false,
  style,
}) => (
  <View style={[styles.bar, style]} pointerEvents="box-none">
    <TouchableOpacity
      style={styles.btn}
      onPress={onToggleMapStyle}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons
        name={MAP_STYLE_ICON[mapStyle]}
        size={18}
        color={PATH_PLAN_GLASS.title}
      />
    </TouchableOpacity>

    <View style={styles.divider} />

    <TouchableOpacity style={styles.btn} onPress={onFitMission} disabled={disabled} activeOpacity={0.7}>
      <MaterialCommunityIcons name="vector-polyline" size={18} color={PATH_PLAN_GLASS.title} />
    </TouchableOpacity>

    <View style={styles.divider} />

    <TouchableOpacity style={styles.btn} onPress={onCenterRover} disabled={disabled} activeOpacity={0.7}>
      <MaterialCommunityIcons name="crosshairs-gps" size={18} color={PATH_PLAN_GLASS.title} />
    </TouchableOpacity>

    <View style={styles.divider} />

    <TouchableOpacity style={styles.btn} onPress={onZoomIn} disabled={disabled} activeOpacity={0.7}>
      <MaterialCommunityIcons name="plus" size={18} color={PATH_PLAN_GLASS.title} />
    </TouchableOpacity>

    <View style={styles.divider} />

    <TouchableOpacity style={styles.btn} onPress={onZoomOut} disabled={disabled} activeOpacity={0.7}>
      <MaterialCommunityIcons name="minus" size={18} color={PATH_PLAN_GLASS.title} />
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 320,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    zIndex: 1000,
  },
  btn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(103, 232, 249, 0.12)',
  },
});
