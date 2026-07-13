import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PathPlanWaypoint } from '../../types/pathplan';
import { optimizePath, PathAxis, PathDirection } from '../../utils/optimizePath';
import { vincentyDistance } from '../../utils/missionCalculator';

// ─── Precise Path Axis / Direction Options ───────────────────

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const AXIS_OPTIONS: { value: PathAxis; shortLabel: string; icon: MaterialIconName }[] = [
  { value: 'EAST_WEST', shortLabel: 'E\u2194W', icon: 'arrow-left-right' },
  { value: 'WEST_EAST', shortLabel: 'W\u2194E', icon: 'arrow-left-right' },
  { value: 'NORTH_SOUTH', shortLabel: 'N\u2194S', icon: 'arrow-up-down' },
  { value: 'SOUTH_NORTH', shortLabel: 'S\u2194N', icon: 'arrow-up-down' },
];

const DIRECTION_OPTIONS: { value: PathDirection; label: string }[] = [
  { value: 'LEFT_RIGHT', label: 'Left \u2192 Right' },
  { value: 'RIGHT_LEFT', label: 'Right \u2192 Left' },
];

const DRAWING_TOOLS_MENU_LEFT = 68;
const DRAWING_TOOLS_MENU_TOP = 0;
const DRAWING_TOOLS_MENU_WIDTH = 280;
const DRAWING_TOOLS_MENU_HEIGHT = 345;

// ─── Props ───────────────────────────────────────────────────

interface DrawingToolsPanelProps {
  activeDrawingTool: string | null;
  onToolSelect: (tool: string | null) => void;
  onShowCircleTool: () => void;
  onShowTextTool: () => void;
  onShowCADDrawing: () => void;
  onShowManualConnection: () => void;
  onShowReverseTool: () => void;
  onShowCornerExtension: () => void;
  onShowSurveyGrid?: () => void;
  onShowSolarTableTool: () => void;
  onShowTemplateManager: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  // Precise path props — when isPrecisePathActive=true, panel shows controls inline
  isPrecisePathActive?: boolean;
  precisePathWaypoints?: PathPlanWaypoint[];
  onPrecisePathPreviewChange?: (preview: PathPlanWaypoint[]) => void;
  onPrecisePathApply?: (optimized: PathPlanWaypoint[]) => void;
  onPrecisePathClose?: () => void;
  onPrecisePathActivate?: () => void;
  onClearAll?: () => void;
  /** Injected by DraggableCard (handleType="custom") — long-press anywhere on the capsule to drag */
  dragGesture?: any;
  /** True while the card is being dragged — injected by DraggableCard */
  isDraggingActive?: boolean;
  onClose?: () => void;
}

export const DrawingToolsPanel: React.FC<DrawingToolsPanelProps> = ({
  activeDrawingTool,
  onToolSelect,
  onShowCircleTool,
  onShowCADDrawing,
  onShowManualConnection,
  onShowReverseTool,
  onShowCornerExtension,
  onShowSurveyGrid,
  onShowSolarTableTool,
  onShowTemplateManager,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  isPrecisePathActive = false,
  precisePathWaypoints = [],
  onPrecisePathPreviewChange,
  onPrecisePathApply,
  onPrecisePathClose,
  onPrecisePathActivate,
  onClearAll,
  dragGesture,
  isDraggingActive,
  onClose,
}) => {
  const [showLinesMenu, setShowLinesMenu] = useState(false);

  // Precise path local state
  const [axis, setAxis] = useState<PathAxis>('EAST_WEST');
  const [direction, setDirection] = useState<PathDirection>('LEFT_RIGHT');

  // Memoized optimization preview
  const preview = useMemo(() => {
    if (!isPrecisePathActive || precisePathWaypoints.length < 2) return null;
    return optimizePath(precisePathWaypoints, { axis, direction });
  }, [isPrecisePathActive, precisePathWaypoints, axis, direction]);

  // Stats for the preview
  const stats = useMemo(() => {
    if (!preview || precisePathWaypoints.length < 2) return null;
    let originalDist = 0;
    let optimizedDist = 0;
    for (let i = 1; i < precisePathWaypoints.length; i++) {
      originalDist += vincentyDistance(
        { lat: precisePathWaypoints[i - 1].lat, lon: precisePathWaypoints[i - 1].lon },
        { lat: precisePathWaypoints[i].lat, lon: precisePathWaypoints[i].lon },
      );
    }
    for (let i = 1; i < preview.length; i++) {
      optimizedDist += vincentyDistance(
        { lat: preview[i - 1].lat, lon: preview[i - 1].lon },
        { lat: preview[i].lat, lon: preview[i].lon },
      );
    }
    const savings = originalDist > 0 ? Math.max(0, ((originalDist - optimizedDist) / originalDist) * 100) : 0;

    const groupKey = axis === 'EAST_WEST' || axis === 'WEST_EAST' ? 'lat' : 'lon';
    const sorted = [...precisePathWaypoints].sort((a, b) => a[groupKey] - b[groupKey]);
    let groupCount = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i][groupKey] - sorted[i - 1][groupKey]) > 0.00001) {
        groupCount++;
      }
    }

    return { optimizedDist, savings, groupCount };
  }, [precisePathWaypoints, preview, axis]);

  // Push preview to parent
  React.useEffect(() => {
    if (preview && onPrecisePathPreviewChange) {
      onPrecisePathPreviewChange(preview);
    }
  }, [preview, onPrecisePathPreviewChange]);

  const formatDist = (m: number): string => {
    if (m < 1000) return `${Math.round(m)}m`;
    return `${(m / 1000).toFixed(2)}km`;
  };

  const handleApply = useCallback(() => {
    if (!preview || !onPrecisePathApply) return;
    onPrecisePathApply(preview);
  }, [preview, onPrecisePathApply]);

  const canApplyPrecisePath = Boolean(preview && precisePathWaypoints.length >= 2);

  const handlePreciseClose = useCallback(() => {
    onPrecisePathClose?.();
  }, [onPrecisePathClose]);

  const drawingToolMenuItems = [
    {
      key: 'cad-draw',
      label: 'CAD Draw',
      icon: 'draw' as MaterialIconName,
      onPress: onShowCADDrawing,
    },
    {
      key: 'auto-circle',
      label: 'Auto Circle',
      icon: 'circle-outline' as MaterialIconName,
      onPress: onShowCircleTool,
    },
    ...(onShowSurveyGrid
      ? [{
          key: 'survey-grid',
          label: 'Survey Grid',
          icon: 'grid' as MaterialIconName,
          onPress: onShowSurveyGrid,
        }]
      : []),
    {
      key: 'solar-table',
      label: 'Solar Table',
      icon: 'solar-panel' as MaterialIconName,
      onPress: onShowSolarTableTool,
    },
    {
      key: 'templates',
      label: 'Templates',
      icon: 'file-document-outline' as MaterialIconName,
      onPress: onShowTemplateManager,
    },
    {
      key: 'manual-connect',
      label: 'Manual Connect',
      icon: 'vector-line' as MaterialIconName,
      onPress: onShowManualConnection,
    },
  ];

  const handleDrawingToolMenuPress = useCallback((onPress: () => void) => {
    setShowLinesMenu(false);
    onPress();
  }, []);

  const capsule = (
    <View style={[styles.capsule, isDraggingActive && styles.capsuleDragging]}>
      {/* Points Button */}
      <TouchableOpacity
        style={[styles.capsuleBtn, activeDrawingTool === 'line' && styles.capsuleBtnActive]}
        onPress={() => {
          setShowLinesMenu(false);
          onToolSelect(activeDrawingTool === 'line' ? null : 'line');
        }}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons 
          name="map-marker-radius" 
          size={18} 
          color={activeDrawingTool === 'line' ? '#67E8F9' : '#94A3B8'} 
        />
        <Text style={[styles.capsuleBtnText, activeDrawingTool === 'line' && styles.capsuleBtnTextActive]}>Points</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* CAD Tools Button */}
      <TouchableOpacity
        style={[
          styles.capsuleBtn, 
          (activeDrawingTool === 'cad-draw' || activeDrawingTool === 'manual-connection') && styles.capsuleBtnActive
        ]}
        onPress={() => {
          setShowLinesMenu(!showLinesMenu);
        }}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons 
          name="vector-polyline" 
          size={18} 
          color={(activeDrawingTool === 'cad-draw' || activeDrawingTool === 'manual-connection') ? '#67E8F9' : '#94A3B8'} 
        />
        <Text style={[
          styles.capsuleBtnText, 
          (activeDrawingTool === 'cad-draw' || activeDrawingTool === 'manual-connection') && styles.capsuleBtnTextActive
        ]}>CAD</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* Precise Path */}
      <TouchableOpacity
        style={[styles.capsuleBtn, isPrecisePathActive && styles.capsuleBtnActive]}
        onPress={() => {
          setShowLinesMenu(false);
          if (isPrecisePathActive) {
            handlePreciseClose();
          } else {
            onPrecisePathActivate?.();
          }
        }}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name="map-marker-path"
          size={18}
          color={isPrecisePathActive ? '#67E8F9' : '#94A3B8'}
        />
        <Text style={[styles.capsuleBtnText, isPrecisePathActive && styles.capsuleBtnTextActive]}>Precise</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* Extension Button */}
      <TouchableOpacity
        style={styles.capsuleBtn}
        onPress={() => {
          setShowLinesMenu(false);
          onShowCornerExtension();
        }}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons 
          name="arrow-expand-all" 
          size={18} 
          color="#94A3B8" 
        />
        <Text style={styles.capsuleBtnText}>Extend</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* Reverse */}
      <TouchableOpacity
        style={styles.capsuleBtn}
        onPress={() => {
          setShowLinesMenu(false);
          onShowReverseTool();
        }}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="swap-vertical" size={18} color="#E5F1FF" />
        <Text style={styles.capsuleBtnText}>Reverse</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* Undo */}
      <TouchableOpacity
        style={[styles.capsuleBtn, !canUndo && styles.capsuleBtnDisabled]}
        onPress={onUndo}
        disabled={!canUndo}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons 
          name="undo" 
          size={18} 
          color={canUndo ? '#E5F1FF' : '#475569'} 
        />
        <Text style={[styles.capsuleBtnText, !canUndo && { color: '#475569' }]}>Undo</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* Redo */}
      <TouchableOpacity
        style={[styles.capsuleBtn, !canRedo && styles.capsuleBtnDisabled]}
        onPress={onRedo}
        disabled={!canRedo}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons 
          name="redo" 
          size={18} 
          color={canRedo ? '#E5F1FF' : '#475569'} 
        />
        <Text style={[styles.capsuleBtnText, !canRedo && { color: '#475569' }]}>Redo</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* Clear */}
      <TouchableOpacity
        style={styles.capsuleBtn}
        onPress={onClearAll}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={18} color="#EF4444" />
        <Text style={[styles.capsuleBtnText, { color: '#EF4444' }]}>Clear</Text>
      </TouchableOpacity>

      {onClose && (
        <>
          <View style={styles.divider} />
          {/* Close Panel */}
          <TouchableOpacity style={styles.capsuleBtn} onPress={onClose} activeOpacity={0.7}>
            <MaterialCommunityIcons name="close" size={18} color="#EF4444" />
            <Text style={[styles.capsuleBtnText, { color: '#EF4444' }]}>Close</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {dragGesture ? <GestureDetector gesture={dragGesture}>{capsule}</GestureDetector> : capsule}

      {/* Precise Path Controls */}
      {isPrecisePathActive && (
        <View style={styles.precisePanel}>
          <View style={styles.preciseHeader}>
            <View>
              <Text style={styles.preciseTitle}>Precise Path</Text>
              <Text style={styles.preciseSubtitle}>{precisePathWaypoints.length} waypoints selected</Text>
            </View>
            <TouchableOpacity style={styles.iconOnlyButton} onPress={handlePreciseClose} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={16} color="#CBD5E1" />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Axis</Text>
          <View style={styles.optionGrid}>
            {AXIS_OPTIONS.map((option) => {
              const isSelected = axis === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.optionChip, isSelected && styles.optionChipActive]}
                  onPress={() => setAxis(option.value)}
                  activeOpacity={0.75}
                >
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={14}
                    color={isSelected ? '#07111B' : '#CBD5E1'}
                  />
                  <Text style={[styles.optionChipText, isSelected && styles.optionChipTextActive]}>
                    {option.shortLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Direction</Text>
          <View style={styles.directionRow}>
            {DIRECTION_OPTIONS.map((option) => {
              const isSelected = direction === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.directionChip, isSelected && styles.optionChipActive]}
                  onPress={() => setDirection(option.value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.directionChipText, isSelected && styles.optionChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{precisePathWaypoints.length}</Text>
              <Text style={styles.statLabel}>Points</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats?.groupCount ?? '-'}</Text>
              <Text style={styles.statLabel}>Runs</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats ? formatDist(stats.optimizedDist) : '-'}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
          </View>

          <Text style={styles.preciseHint}>
            {stats
              ? `${stats.savings.toFixed(0)}% shorter than current order`
              : 'Add at least 2 waypoints to preview'}
          </Text>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={handlePreciseClose} activeOpacity={0.75}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, !canApplyPrecisePath && styles.applyButtonDisabled]}
              onPress={handleApply}
              disabled={!canApplyPrecisePath}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="check"
                size={15}
                color={canApplyPrecisePath ? '#052E2B' : '#64748B'}
              />
              <Text style={[styles.applyButtonText, !canApplyPrecisePath && styles.applyButtonTextDisabled]}>
                Apply
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* CAD Tools Dropdown Sub-menu */}
      {showLinesMenu && (
        <View style={styles.dropdownMenu}>
          <Text style={styles.dropdownTitle}>DRAWING TOOLS</Text>
          <View style={styles.dropdownList}>
            {drawingToolMenuItems.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.dropdownItem}
                onPress={() => handleDrawingToolMenuPress(item.onPress)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={item.icon}
                  size={18}
                  color="#94A3B8"
                  style={styles.dropdownItemIcon}
                />
                <Text style={styles.dropdownItemText} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    padding: 0,
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
  capsuleDragging: {
    borderColor: '#67E8F9',
    shadowColor: '#67E8F9',
    shadowOpacity: 0.22,
  },
  capsuleBtn: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'column',
  },
  capsuleBtnActive: {
    backgroundColor: 'rgba(103, 232, 249, 0.12)',
    borderWidth: 1,
    borderColor: '#67E8F9',
  },
  capsuleBtnDisabled: {
    opacity: 0.3,
  },
  capsuleBtnText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
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
  precisePanel: {
    position: 'absolute',
    left: 68,
    top: 112,
    width: 242,
    backgroundColor: '#07111BF2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.24)',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 1500,
  },
  preciseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  preciseTitle: {
    color: '#E5F1FF',
    fontSize: 13,
    fontWeight: '700',
  },
  preciseSubtitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  iconOnlyButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  sectionLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  optionChip: {
    width: 52,
    height: 30,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  optionChipActive: {
    backgroundColor: '#67E8F9',
    borderColor: '#67E8F9',
  },
  optionChipText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '700',
  },
  optionChipTextActive: {
    color: '#07111B',
  },
  directionRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  directionChip: {
    flex: 1,
    height: 30,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  directionChipText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 7,
  },
  statBox: {
    flex: 1,
    minHeight: 44,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.14)',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  statValue: {
    color: '#E5F1FF',
    fontSize: 12,
    fontWeight: '800',
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 8,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  preciseHint: {
    minHeight: 16,
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 9,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    flex: 1,
    height: 32,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
  },
  cancelButtonText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  applyButton: {
    flex: 1,
    height: 32,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#67E8F9',
  },
  applyButtonDisabled: {
    backgroundColor: 'rgba(100, 116, 139, 0.18)',
  },
  applyButtonText: {
    color: '#052E2B',
    fontSize: 11,
    fontWeight: '800',
  },
  applyButtonTextDisabled: {
    color: '#64748B',
  },
  dropdownMenu: {
    position: 'absolute',
    left: DRAWING_TOOLS_MENU_LEFT,
    top: DRAWING_TOOLS_MENU_TOP,
    width: DRAWING_TOOLS_MENU_WIDTH,
    height: DRAWING_TOOLS_MENU_HEIGHT,
    backgroundColor: '#07111be6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.15)',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 2000,
  },
  dropdownTitle: {
    color: '#67E8F9',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingBottom: 10,
  },
  dropdownList: {
    flex: 1,
    gap: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.1)',
    backgroundColor: 'rgba(8, 16, 26, 0.9)',
    paddingHorizontal: 12,
  },
  dropdownItemIcon: {
    marginRight: 10,
  },
  dropdownItemText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
});
