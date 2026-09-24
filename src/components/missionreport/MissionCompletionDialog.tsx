import React from 'react';
import { View, StyleSheet, Modal, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import MissionReportExport from './MissionReportExport';
import { Waypoint } from './types';
import type { WaypointUiStatus } from '../../types/missionWaypointStatus';

interface MissionCompletionDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onExport: () => void;
  missionStats: {
    totalWaypoints: number;
    completedWaypoints: number;
    skippedWaypoints: number;
    missionDuration: string;
    startTime: string;
    endTime: string;
  };
  waypoints: Waypoint[];
  statusMap: Record<number, {
    reached?: boolean;
    marked?: boolean;
    status?: WaypointUiStatus;
    timestamp?: string;
    pile?: string | number;
    rowNo?: string | number;
    remark?: string;
  }>;
  missionMode: string | null;
  fetchExportData?: () => Promise<
    MissionCompletionDialogProps['statusMap'] | null
  >;
}

/** A compact acknowledgement card shown after the rover confirms completion. */
export const MissionCompletionDialog: React.FC<MissionCompletionDialogProps> = ({
  visible,
  onDismiss,
  onExport,
  missionStats,
  waypoints,
  statusMap,
  missionMode,
  fetchExportData,
}) => {
  const {
    totalWaypoints,
    completedWaypoints,
    skippedWaypoints,
    missionDuration,
  } = missionStats;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View
          style={styles.dialog}
          accessibilityViewIsModal
          accessibilityLabel="Mission complete"
        >
          <View style={styles.header}>
            <View style={styles.successIcon}>
              <MaterialIcons name="check" size={25} color="#052E1A" />
            </View>
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>MISSION COMPLETE</Text>
              <Text style={styles.title}>All done</Text>
            </View>
            <TouchableOpacity
              onPress={onDismiss}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close mission completion dialog"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="close" size={19} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <Text style={styles.message}>
            The rover has finished processing this mission.
          </Text>

          <View style={styles.metrics}>
            <View style={[styles.metric, styles.metricPrimary]}>
              <Text style={styles.metricValue}>{completedWaypoints}/{totalWaypoints}</Text>
              <Text style={styles.metricLabel}>COMPLETED</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{missionDuration}</Text>
              <Text style={styles.metricLabel}>DURATION</Text>
            </View>
            {skippedWaypoints > 0 && (
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{skippedWaypoints}</Text>
                <Text style={styles.metricLabel}>SKIPPED</Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss mission completion dialog"
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
            <MissionReportExport
              waypoints={waypoints}
              statusMap={statusMap}
              missionMode={missionMode}
              onExport={onExport}
              onExportComplete={() => {}}
              fetchExportData={fetchExportData}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 12, 27, 0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0F1D32',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.36,
    shadowRadius: 22,
    elevation: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  successIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#6EE7B7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  heading: {
    flex: 1,
  },
  eyebrow: {
    color: '#6EE7B7',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 21,
    fontWeight: '700',
    marginTop: 2,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
  },
  message: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  metricPrimary: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.28)',
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: 4,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 18,
  },
  doneButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  doneButtonText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
});
