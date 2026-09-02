import React from 'react';
import { View, StyleSheet, Modal, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTelemetry } from '../../context/TelemetryContext';
import { useMission } from '../../context/MissionContext';

interface MissionStartConfirmationDialogProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  hasExistingData: boolean;
  existingMissionInfo?: {
    waypointCount: number;
    hasProgress: boolean;
  };
}

export const MissionStartConfirmationDialog: React.FC<MissionStartConfirmationDialogProps> = ({
  visible,
  onConfirm,
  onCancel,
  hasExistingData,
  existingMissionInfo,
}) => {
  const { telemetry } = useTelemetry();
  const { missionMode } = useMission();

  // RTK status logic (from MissionOpsPanel)
  const fixType = telemetry?.rtk?.fix_type ?? 0;
  const rtkColor = fixType >= 5 ? colors.success : fixType >= 4 ? colors.warning : colors.danger;
  const rtkLabel = fixType >= 5 ? 'LOCKED' : fixType >= 4 ? 'WEAK' : 'LOST';
  const rtkText =
    fixType >= 6 ? 'RTK Fixed' :
    fixType >= 5 ? 'RTK Float' :
    fixType >= 4 ? 'DGPS' :
    fixType >= 3 ? '3D Fix' :
    fixType >= 2 ? '2D Fix' :
    fixType >= 1 ? 'No Fix' : 'No GPS';

  // Mode color
  const modeColor = colors.success;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Image source={require('../../../assets/rover-icon.png')} style={{ width: 20, height: 20 }} resizeMode="contain" />
              </View>
              <Text style={styles.headerTitle}>MISSION START</Text>
            </View>
            <View style={[styles.headerBadge, hasExistingData && styles.headerBadgeWarn]}>
              <View style={[styles.headerBadgeDot, { backgroundColor: hasExistingData ? colors.warning : '#4ade80' }]} />
              <Text style={[styles.headerBadgeText, { color: hasExistingData ? colors.warning : '#4ade80' }]}>
                {hasExistingData ? 'WARNING' : 'READY'}
              </Text>
            </View>
          </View>

          {/* Icon + message */}
          <View style={styles.body}>
            <View style={[styles.bigIconWrap, { borderColor: hasExistingData ? `${colors.warning}40` : `${colors.success}40`, backgroundColor: hasExistingData ? `${colors.warning}12` : `${colors.success}12` }]}>
              <Ionicons
                name={hasExistingData ? 'warning' : 'checkmark-circle'}
                size={36}
                color={hasExistingData ? colors.warning : colors.success}
              />
            </View>
            <Text style={styles.bodyTitle}>
              {hasExistingData ? 'Existing Data Will Be Cleared' : 'Confirm Mission Start'}
            </Text>
            <Text style={styles.bodySubtitle}>
              {hasExistingData
                ? 'Starting a new mission will reset the current progress. Previous data remains available for export.'
                : 'All systems ready. The mission controller will begin executing waypoints.'}
            </Text>
          </View>

          {/* Mode + RTK status cards */}
          <View style={styles.cardsRow}>
            {/* Mode Card */}
            <View style={styles.infoCard}>
              <View style={[styles.cardAccent, { backgroundColor: modeColor }]} />
              <View style={styles.cardInner}>
                <View style={styles.cardTopRow}>
                  <View style={[styles.cardIconWrap, { borderColor: `${modeColor}40` }]}>
                    <Ionicons name="settings-sharp" size={14} color={modeColor} />
                  </View>
                  <View style={[styles.cardBadge, { backgroundColor: `${modeColor}18`, borderColor: modeColor }]}>
                    <View style={[styles.cardBadgeDot, { backgroundColor: modeColor }]} />
                    <Text style={[styles.cardBadgeText, { color: modeColor }]}>ACTIVE</Text>
                  </View>
                </View>
                <Text style={styles.cardLabel}>MODE</Text>
                <Text style={styles.cardValue} numberOfLines={1}>{missionMode ?? '—'}</Text>
              </View>
            </View>

            {/* RTK Card */}
            <View style={styles.infoCard}>
              <View style={[styles.cardAccent, { backgroundColor: rtkColor }]} />
              <View style={styles.cardInner}>
                <View style={styles.cardTopRow}>
                  <View style={[styles.cardIconWrap, { borderColor: `${rtkColor}40` }]}>
                    <Ionicons name="cellular" size={14} color={rtkColor} />
                  </View>
                  <View style={[styles.cardBadge, { backgroundColor: `${rtkColor}18`, borderColor: rtkColor }]}>
                    <View style={[styles.cardBadgeDot, { backgroundColor: rtkColor }]} />
                    <Text style={[styles.cardBadgeText, { color: rtkColor }]}>{rtkLabel}</Text>
                  </View>
                </View>
                <Text style={styles.cardLabel}>GPS / RTK</Text>
                <Text style={[styles.cardValue, { color: rtkColor }]} numberOfLines={1}>{rtkText}</Text>
              </View>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.75}>
              <View style={styles.cancelIconWrap}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
              </View>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm} activeOpacity={0.8}>
              <Image source={require('../../../assets/rover-icon.png')} style={{ width: 20, height: 20 }} resizeMode="contain" />
              <Text style={styles.confirmText}>
                {hasExistingData ? 'START NEW MISSION' : 'START MISSION'}
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: colors.panelBg,
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },

  // ── HEADER ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  headerBadgeWarn: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  headerBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  headerBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // ── BODY ──
  body: {
    alignItems: 'center',
    gap: 10,
  },
  bigIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bodyTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  bodySubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── INFO CARDS ──
  cardsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  infoCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardAccent: {
    width: 3,
    alignSelf: 'stretch',
  },
  cardInner: {
    flex: 1,
    padding: 10,
    gap: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  cardBadgeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  cardBadgeText: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cardLabel: {
    color: 'rgba(103,232,249,0.8)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  cardValue: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── DIVIDER ──
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },

  // ── ACTIONS ──
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  cancelIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.success,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.5)',
  },
  confirmText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
