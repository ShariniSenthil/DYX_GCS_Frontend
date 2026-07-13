import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { colors } from '../../theme/colors';

interface FreeDrawDialogProps {
  visible: boolean;
  onClose: () => void;
  onStartDrawing: (settings: DrawSettings) => void;
  onPinHome?: () => void;
  hasHomePosition: boolean;
  homePosition?: { lat: number; lng: number } | null;
}

export interface DrawSettings {
  drawingWidth: number; // meters - total width of drawing area
  drawingHeight: number; // meters - total height of drawing area
  waypointSpacing: number; // meters - spacing between waypoints
  startPosition: { lat: number; lng: number };
}

export const FreeDrawDialog: React.FC<FreeDrawDialogProps> = ({
  visible,
  onClose,
  onStartDrawing,
  onPinHome,
  hasHomePosition,
  homePosition,
}) => {
  const [drawingWidth, setDrawingWidth] = useState(50); // meters
  const [drawingHeight, setDrawingHeight] = useState(50); // meters
  const [waypointSpacing, setWaypointSpacing] = useState(2); // meters
  const [needsHomePin, setNeedsHomePin] = useState(!hasHomePosition);

  const handleStartDrawing = () => {
    if (!homePosition && !hasHomePosition) {
      setNeedsHomePin(true);
      return;
    }

    const startPos = homePosition || { lat: 13.0827, lng: 80.2707 };

    onStartDrawing({
      drawingWidth,
      drawingHeight,
      waypointSpacing,
      startPosition: startPos,
    });

    onClose();
  };

  const handlePinHome = () => {
    // Close dialog and let parent handle home pinning
    onClose();
    // Signal parent to enter home pin mode
    if (onPinHome) {
      onPinHome();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerIcon}>✏️</Text>
            <Text style={styles.headerTitle}>FREE DRAW MODE</Text>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Info */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                🎨 Draw any shape, profile, or art on the map. Your drawing will be converted to waypoints.
              </Text>
            </View>

            {/* Home Position Status */}
            <View style={styles.section}>
              <Text style={styles.label}>Start Position (Home)</Text>
              <View style={[styles.statusBox, hasHomePosition ? styles.statusOk : styles.statusWarning]}>
                {hasHomePosition && homePosition ? (
                  <>
                    <Text style={styles.statusIcon}>✅</Text>
                    <View style={styles.statusContent}>
                      <Text style={styles.statusTitle}>Home Position Set</Text>
                      <Text style={styles.statusCoords}>
                        Lat: {homePosition.lat.toFixed(6)}, Lng: {homePosition.lng.toFixed(6)}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.statusIcon}>⚠️</Text>
                    <View style={styles.statusContent}>
                      <Text style={styles.statusTitle}>No Home Position</Text>
                      <Text style={styles.statusDesc}>
                        Please pin a home position on the map first
                      </Text>
                    </View>
                  </>
                )}
              </View>
              {!hasHomePosition && (
                <TouchableOpacity style={styles.pinHomeBtn} onPress={handlePinHome}>
                  <Text style={styles.pinHomeBtnText}>✦ Pin Home on Map</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Drawing Area Dimensions */}
            <View style={styles.section}>
              <Text style={styles.label}>Drawing Area Width: {drawingWidth}m</Text>
              <View style={styles.dimensionRow}>
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setDrawingWidth(Math.max(10, drawingWidth - 10))}
                >
                  <Text style={styles.dimBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.dimInput}
                  value={String(drawingWidth)}
                  onChangeText={(t) => setDrawingWidth(Math.max(1, parseInt(t) || 10))}
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setDrawingWidth(Math.min(500, drawingWidth + 10))}
                >
                  <Text style={styles.dimBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Drawing Area Height: {drawingHeight}m</Text>
              <View style={styles.dimensionRow}>
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setDrawingHeight(Math.max(10, drawingHeight - 10))}
                >
                  <Text style={styles.dimBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.dimInput}
                  value={String(drawingHeight)}
                  onChangeText={(t) => setDrawingHeight(Math.max(1, parseInt(t) || 10))}
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setDrawingHeight(Math.min(500, drawingHeight + 10))}
                >
                  <Text style={styles.dimBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Mark Point Spacing: {waypointSpacing}m</Text>
              <View style={styles.dimensionRow}>
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setWaypointSpacing(Math.max(0.5, waypointSpacing - 0.5))}
                >
                  <Text style={styles.dimBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.dimInput}
                  value={String(waypointSpacing)}
                  onChangeText={(t) => setWaypointSpacing(Math.max(0.1, parseFloat(t) || 1))}
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setWaypointSpacing(Math.min(20, waypointSpacing + 0.5))}
                >
                  <Text style={styles.dimBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Smaller spacing = more waypoints, smoother curves
              </Text>
            </View>

            {/* Drawing Preview */}
            <View style={styles.section}>
              <Text style={styles.label}>Drawing Area Preview</Text>
              <View style={styles.previewArea}>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewDim}>{drawingWidth}m × {drawingHeight}m</Text>
                  <Text style={styles.previewInfo}>
                    ~{Math.ceil((drawingWidth / waypointSpacing) * (drawingHeight / waypointSpacing))} max points
                  </Text>
                </View>
              </View>
            </View>

            {/* Drawing Tips */}
            <View style={styles.tipsBox}>
              <Text style={styles.tipsTitle}>💡 Drawing Tips</Text>
              <Text style={styles.tipItem}>• Touch and drag on map to draw</Text>
              <Text style={styles.tipItem}>• Lift finger to create a gap</Text>
              <Text style={styles.tipItem}>• Double-tap to finish drawing</Text>
              <Text style={styles.tipItem}>• Drawing is scaled to fit the area</Text>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={onClose}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.confirmBtn,
                !hasHomePosition && styles.confirmBtnDisabled,
              ]}
              onPress={handleStartDrawing}
              disabled={!hasHomePosition}
            >
              <Text style={styles.confirmBtnText}>✏️ Start Drawing</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: colors.panelBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1,
    textAlign: 'center',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
  },
  infoBox: {
    backgroundColor: 'rgba(103, 232, 249, 0.1)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.3)',
    marginBottom: 16,
  },
  infoText: {
    fontSize: 12,
    color: colors.accent,
    lineHeight: 18,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  statusOk: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  statusWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  statusIcon: {
    fontSize: 24,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  statusCoords: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  statusDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pinHomeBtn: {
    marginTop: 10,
    backgroundColor: colors.blueBtn,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  pinHomeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  dimensionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dimBtn: {
    width: 44,
    height: 44,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dimBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  dimInput: {
    flex: 1,
    height: 44,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 6,
    fontStyle: 'italic',
  },
  previewArea: {
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  previewGrid: {
    width: 120,
    height: 100,
    backgroundColor: 'rgba(103, 232, 249, 0.1)',
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewDim: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  previewInfo: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 4,
  },
  tipsBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  tipsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.greenBtn,
    marginBottom: 8,
  },
  tipItem: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmBtn: {
    backgroundColor: colors.greenBtn,
  },
  confirmBtnDisabled: {
    backgroundColor: colors.inputBg,
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
});
