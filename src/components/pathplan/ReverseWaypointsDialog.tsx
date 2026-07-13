import React from 'react';
import { Modal, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PATH_PLAN_GLASS } from '../../constants/pathPlanGlass';

interface ReverseWaypointsDialogProps {
  visible: boolean;
  waypointCount: number;
  onReverse: () => void;
  onClose: () => void;
}

export const ReverseWaypointsDialog: React.FC<ReverseWaypointsDialogProps> = ({
  visible,
  waypointCount,
  onReverse,
  onClose,
}) => {
  const handleReverse = () => {
    if (waypointCount < 2) return;
    onReverse();
    onClose();
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
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <MaterialCommunityIcons name="swap-vertical" size={18} color={PATH_PLAN_GLASS.cyan} />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>REVERSE PATH</Text>
              <Text style={styles.headerSubtitle}>{waypointCount} marking points</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.75}>
              <MaterialCommunityIcons name="close" size={16} color={PATH_PLAN_GLASS.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryValue}>1</Text>
                <Text style={styles.summaryLabel}>becomes last</Text>
              </View>
              <MaterialCommunityIcons name="arrow-left-right" size={18} color={PATH_PLAN_GLASS.cyan} />
              <View style={styles.summaryTile}>
                <Text style={styles.summaryValue}>{waypointCount || '-'}</Text>
                <Text style={styles.summaryLabel}>becomes first</Text>
              </View>
            </View>

            <Text style={styles.description}>
              Reverse the mission order and recalculate segment distances. Existing coordinates and waypoint details stay unchanged.
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.reverseButton, waypointCount < 2 && styles.reverseButtonDisabled]}
              onPress={handleReverse}
              disabled={waypointCount < 2}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="swap-vertical"
                size={17}
                color={waypointCount < 2 ? '#64748B' : '#052E2B'}
              />
              <Text style={[styles.reverseButtonText, waypointCount < 2 && styles.reverseButtonTextDisabled]}>
                Reverse
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
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: PATH_PLAN_GLASS.borderSubtle,
    gap: 10,
  },
  headerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: PATH_PLAN_GLASS.iconWrapBg,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: PATH_PLAN_GLASS.title,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  summaryTile: {
    flex: 1,
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.14)',
    backgroundColor: 'rgba(8, 16, 26, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  summaryValue: {
    color: PATH_PLAN_GLASS.title,
    fontSize: 18,
    fontWeight: '800',
  },
  summaryLabel: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 3,
    textTransform: 'uppercase',
  },
  description: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelButton: {
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  cancelButtonText: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 12,
    fontWeight: '700',
  },
  reverseButton: {
    backgroundColor: PATH_PLAN_GLASS.cyan,
    borderColor: PATH_PLAN_GLASS.cyan,
  },
  reverseButtonDisabled: {
    backgroundColor: 'rgba(100, 116, 139, 0.16)',
    borderColor: 'rgba(100, 116, 139, 0.24)',
  },
  reverseButtonText: {
    color: '#052E2B',
    fontSize: 12,
    fontWeight: '800',
  },
  reverseButtonTextDisabled: {
    color: '#64748B',
  },
});
