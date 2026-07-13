import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PATH_PLAN_GLASS, PATH_PLAN_HEADER } from '../../constants/pathPlanGlass';
import {
  CornerExtensionOptions,
  DEFAULT_EXTENSION_OPTIONS,
} from '../../utils/cornerExtension';

const PANEL_LEFT = 84;
const PANEL_TOP = 221;
const PANEL_WIDTH = 280;
const PANEL_HEIGHT = 345;

interface CornerExtensionDialogProps {
  visible: boolean;
  onClose: () => void;
  onApply: (options: CornerExtensionOptions) => void;
  waypointCount: number;
  cornersDetected: number;
  shortSegmentWarnings: number;
}

export const CornerExtensionDialog: React.FC<CornerExtensionDialogProps> = ({
  visible,
  onClose,
  onApply,
  waypointCount,
  cornersDetected,
  shortSegmentWarnings,
}) => {
  const [extensionDistance, setExtensionDistance] = useState(
    DEFAULT_EXTENSION_OPTIONS.extensionDistance.toString(),
  );
  const [turnAngleThreshold, setTurnAngleThreshold] = useState(
    DEFAULT_EXTENSION_OPTIONS.turnAngleThreshold.toString(),
  );
  const [keepOriginal, setKeepOriginal] = useState(
    DEFAULT_EXTENSION_OPTIONS.keepOriginalWaypoints,
  );
  const [invertMode, setInvertMode] = useState(DEFAULT_EXTENSION_OPTIONS.invertMode);
  const [errorText, setErrorText] = useState<string | null>(null);

  const canApply = waypointCount >= 3 && cornersDetected > 0;
  const totalAfter = waypointCount + cornersDetected;

  const handleApply = () => {
    const dist = parseFloat(extensionDistance);
    const threshold = parseFloat(turnAngleThreshold);

    if (isNaN(dist) || dist <= 0 || dist > 50) {
      setErrorText('Extension distance must be between 0.1 and 50 meters.');
      return;
    }
    if (isNaN(threshold) || threshold < 10 || threshold > 90) {
      setErrorText('Turn angle threshold must be between 10 and 90 degrees.');
      return;
    }
    if (waypointCount < 3) {
      setErrorText('At least 3 waypoints are required for corner extension.');
      return;
    }

    onApply({
      extensionDistance: dist,
      turnAngleThreshold: threshold,
      keepOriginalWaypoints: keepOriginal,
      invertMode,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <MaterialCommunityIcons name="arrow-expand-all" size={14} color={PATH_PLAN_GLASS.cyan} />
              </View>
              <Text style={styles.title}>CORNER EXTENSION</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={14} color={PATH_PLAN_GLASS.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.metricsRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{waypointCount}</Text>
                <Text style={styles.metricLabel}>Points</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{waypointCount < 3 ? '-' : cornersDetected}</Text>
                <Text style={styles.metricLabel}>Corners</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>+{canApply ? cornersDetected : 0}</Text>
                <Text style={styles.metricLabel}>Added</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PARAMETERS</Text>
              <View style={styles.compactRow}>
                <Text style={styles.label}>Distance (m)</Text>
                <TextInput
                  style={styles.input}
                  value={extensionDistance}
                  onChangeText={(value) => {
                    setExtensionDistance(value);
                    setErrorText(null);
                  }}
                  keyboardType="numeric"
                  placeholder="6.5"
                  placeholderTextColor={PATH_PLAN_GLASS.muted}
                />
              </View>
              <View style={styles.compactRow}>
                <Text style={styles.label}>Turn Angle (deg)</Text>
                <TextInput
                  style={styles.input}
                  value={turnAngleThreshold}
                  onChangeText={(value) => {
                    setTurnAngleThreshold(value);
                    setErrorText(null);
                  }}
                  keyboardType="numeric"
                  placeholder="30"
                  placeholderTextColor={PATH_PLAN_GLASS.muted}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>OPTIONS</Text>
              <TouchableOpacity
                style={[styles.optionRow, keepOriginal && styles.optionRowActive]}
                onPress={() => {
                  setKeepOriginal(!keepOriginal);
                  setErrorText(null);
                }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="map-marker-check"
                  size={16}
                  color={keepOriginal ? PATH_PLAN_GLASS.cyan : PATH_PLAN_GLASS.muted}
                />
                <Text style={[styles.optionText, keepOriginal && styles.optionTextActive]}>
                  Keep original corners
                </Text>
              </TouchableOpacity>

              <View style={styles.invertRow}>
                <TouchableOpacity
                  style={[styles.invertBtn, !invertMode && styles.invertBtnActive]}
                  onPress={() => {
                    setInvertMode(false);
                    setErrorText(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.invertBtnText, !invertMode && styles.invertBtnTextActive]}>
                    Standard
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.invertBtn, invertMode && styles.invertBtnActive]}
                  onPress={() => {
                    setInvertMode(true);
                    setErrorText(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.invertBtnText, invertMode && styles.invertBtnTextActive]}>
                    Invert
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.previewRow}>
              <Text style={styles.previewText}>Total after apply</Text>
              <Text style={styles.previewValue}>{canApply ? totalAfter : '-'}</Text>
            </View>

            {shortSegmentWarnings > 0 && (
              <Text style={styles.warningText}>{shortSegmentWarnings} short segment warning(s)</Text>
            )}
            {errorText && <Text style={styles.errorText}>{errorText}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyBtn, !canApply && styles.applyBtnDisabled]}
              onPress={handleApply}
              activeOpacity={0.7}
              disabled={!canApply}
            >
              <Text style={[styles.applyText, !canApply && styles.applyTextDisabled]}>
                Apply
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dialog: {
    position: 'absolute',
    left: PANEL_LEFT,
    top: PANEL_TOP,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: PATH_PLAN_GLASS.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconWrap: PATH_PLAN_HEADER.iconWrap,
  closeBtn: PATH_PLAN_HEADER.closeBtn,
  title: {
    ...PATH_PLAN_HEADER.title,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    gap: 8,
    paddingTop: 10,
    paddingBottom: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  metricBox: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    color: PATH_PLAN_GLASS.title,
    fontSize: 13,
    fontWeight: '800',
  },
  metricLabel: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 8,
    fontWeight: '700',
    marginTop: 2,
  },
  section: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    padding: 10,
    gap: 8,
  },
  sectionTitle: {
    color: PATH_PLAN_GLASS.cyan,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  label: {
    flex: 1,
    color: PATH_PLAN_GLASS.label,
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    width: 78,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.03)',
    color: PATH_PLAN_GLASS.title,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    textAlign: 'right',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
    backgroundColor: 'rgba(8, 16, 26, 0.9)',
    paddingHorizontal: 10,
    gap: 10,
  },
  optionRowActive: {
    borderColor: 'rgba(103, 232, 249, 0.55)',
    backgroundColor: PATH_PLAN_GLASS.iconWrapBg,
  },
  optionText: {
    flex: 1,
    color: PATH_PLAN_GLASS.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  optionTextActive: {
    color: PATH_PLAN_GLASS.cyan,
  },
  invertRow: {
    flexDirection: 'row',
    gap: 8,
  },
  invertBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
    backgroundColor: 'rgba(8, 16, 26, 0.9)',
  },
  invertBtnActive: {
    backgroundColor: PATH_PLAN_GLASS.iconWrapBg,
    borderColor: 'rgba(103, 232, 249, 0.55)',
  },
  invertBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: PATH_PLAN_GLASS.muted,
  },
  invertBtnTextActive: {
    color: PATH_PLAN_GLASS.cyan,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    paddingHorizontal: 10,
    minHeight: 36,
  },
  previewText: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 11,
    fontWeight: '700',
  },
  previewValue: {
    color: PATH_PLAN_GLASS.title,
    fontSize: 12,
    fontWeight: '800',
  },
  warningText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '700',
  },
  errorText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: PATH_PLAN_GLASS.borderSubtle,
  },
  cancelBtn: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    backgroundColor: PATH_PLAN_GLASS.innerBg,
  },
  cancelText: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 11,
    fontWeight: '700',
  },
  applyBtn: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PATH_PLAN_GLASS.cyan,
  },
  applyBtnDisabled: {
    backgroundColor: 'rgba(100, 116, 139, 0.18)',
  },
  applyText: {
    color: '#052E2B',
    fontSize: 11,
    fontWeight: '800',
  },
  applyTextDisabled: {
    color: '#64748B',
  },
});
