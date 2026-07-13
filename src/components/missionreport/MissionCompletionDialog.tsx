import React from 'react';
import { View, StyleSheet, Modal, Text, TouchableOpacity, ScrollView } from 'react-native';
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
}

export const MissionCompletionDialog: React.FC<MissionCompletionDialogProps> = ({
  visible,
  onDismiss,
  onExport,
  missionStats,
  waypoints,
  statusMap,
  missionMode
}) => {
  const { totalWaypoints, completedWaypoints, skippedWaypoints, missionDuration, startTime, endTime } = missionStats;

  // Debug logging
  React.useEffect(() => {
    // console.log('[MissionCompletionDialog] Visibility changed:', visible);
    if (visible) {
      // console.log('[MissionCompletionDialog] 📊 Mission stats:', missionStats);
    }
  }, [visible, missionStats]);

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Success Icon */}
            <View style={styles.iconContainer}>
              <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
            </View>
            
            {/* Title */}
            <Text style={styles.title}>Mission Completed Successfully!</Text>
            
            {/* Mission Summary Card */}
            <View style={styles.summaryCard}>
              <Text style={styles.sectionTitle}>Mission Summary</Text>
              <View style={styles.divider} />
              
              <View style={styles.statsContainer}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Waypoints:</Text>
                  <View style={styles.statChip}>
                    <Text style={styles.statChipText}>{totalWaypoints}</Text>
                  </View>
                </View>
                
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Completed:</Text>
                  <View style={[styles.statChip, styles.completedChip]}>
                    <Text style={[styles.statChipText, styles.completedChipText]}>{completedWaypoints}</Text>
                  </View>
                </View>
                
                {skippedWaypoints > 0 && (
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Skipped:</Text>
                    <View style={[styles.statChip, styles.skippedChip]}>
                      <Text style={[styles.statChipText, styles.skippedChipText]}>{skippedWaypoints}</Text>
                    </View>
                  </View>
                )}
                
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Duration:</Text>
                  <Text style={styles.statValue}>{missionDuration}</Text>
                </View>
                
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Started:</Text>
                  <Text style={styles.statValue}>{startTime}</Text>
                </View>
                
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Completed:</Text>
                  <Text style={styles.statValue}>{endTime}</Text>
                </View>
              </View>
            </View>
            
            {/* Success Message */}
            <Text style={styles.successMessage}>
              All waypoints have been processed successfully. You can now export the mission report or close this dialog.
            </Text>
          </ScrollView>
          
          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.okButton} onPress={onDismiss}>
              <MaterialIcons name="check" size={20} color="#fff" style={styles.okIcon} />
              <Text style={styles.okButtonText}>OK</Text>
            </TouchableOpacity>
            <MissionReportExport
              waypoints={waypoints}
              statusMap={statusMap}
              missionMode={missionMode}
              onExport={onExport}
              onExportComplete={() => {}} // Can be used if needed
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxWidth: 500,
    width: '100%',
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#dee2e6',
    marginBottom: 12,
  },
  statsContainer: {
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  statLabel: {
    fontSize: 16,
    color: '#666',
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  statChip: {
    backgroundColor: '#e9ecef',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 60,
    alignItems: 'center',
  },
  statChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  completedChip: {
    backgroundColor: '#d4edda',
  },
  completedChipText: {
    color: '#155724',
  },
  skippedChip: {
    backgroundColor: '#fff3cd',
  },
  skippedChipText: {
    color: '#856404',
  },
  successMessage: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    paddingTop: 0,
    gap: 12,
  },
  okButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  okButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 4,
  },
  okIcon: {
    marginRight: 0,
  },
  exportButton: {
    flex: 1,
    backgroundColor: '#0047AB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  exportIcon: {
    marginRight: 4,
  },
});