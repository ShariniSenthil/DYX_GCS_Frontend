import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { Waypoint } from './types';

interface WaypointPreviewDialogProps {
  visible: boolean;
  waypoints: Waypoint[];
  onConfirm: () => void;
  onCancel: () => void;
  isUploading?: boolean;
}

export const WaypointPreviewDialog: React.FC<WaypointPreviewDialogProps> = ({
  visible,
  waypoints,
  onConfirm,
  onCancel,
  isUploading = false,
}) => {
  const totalCount = waypoints.length;
  const displayWaypoints = waypoints.slice(0, 10);
  const remainingCount = totalCount > 10 ? totalCount - 10 : 0;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialogContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Confirm Mission Upload</Text>
          </View>

          {/* Content */}
          <ScrollView 
            style={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            <Text style={styles.description}>
              Ready to upload{' '}
              <Text style={styles.highlightCount}>{totalCount}</Text>{' '}
              waypoints to the mission controller?
            </Text>

            {/* Waypoint Summary Box */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>Waypoint Summary:</Text>
              
              <View style={styles.waypointList}>
                {displayWaypoints.map((wp, index) => (
                  <View key={`preview-wp-${wp.lat}-${wp.lon}-${index}`} style={styles.waypointItem}>
                    {/* Waypoint Header */}
                    <View style={styles.waypointHeader}>
                      <Text style={styles.waypointNumber}>WP {index + 1}:</Text>
                      <Text style={styles.waypointCoords}>
                        {wp.lat.toFixed(6)}, {wp.lon.toFixed(6)}
                      </Text>
                    </View>
                    
                    {/* Waypoint Details */}
                    <View style={styles.waypointDetails}>
                      <Text style={styles.detailText}>Row: {wp.row || '-'}</Text>
                      <Text style={styles.detailText}>Block: {wp.block || '-'}</Text>
                      <Text style={styles.detailText}>Pile: {wp.pile || '-'}</Text>
                    </View>
                  </View>
                ))}

                {remainingCount > 0 && (
                  <View style={styles.remainingBox}>
                    <Text style={styles.remainingText}>
                      ... and {remainingCount} more waypoint{remainingCount !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={isUploading}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button, 
                styles.confirmButton,
                isUploading && styles.buttonDisabled
              ]}
              onPress={onConfirm}
              disabled={isUploading}
              activeOpacity={0.7}
            >
              <Text style={[styles.buttonText, styles.confirmButtonText]}>
                {isUploading ? '⏳ Uploading...' : 'Upload Mission'}
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogContainer: {
    backgroundColor: colors.panelBg,
    borderRadius: 16,
    maxWidth: 500,
    width: '100%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#67E8F9', // Cyan
  },
  scrollContent: {
    flex: 1,
    padding: 24,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  highlightCount: {
    fontWeight: '700',
    color: '#3B82F6', // Blue
    fontSize: 16,
  },
  summaryBox: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#67E8F9', // Cyan
    marginBottom: 16,
  },
  waypointList: {
    gap: 12,
  },
  waypointItem: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  waypointHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  waypointNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#67E8F9', // Cyan
  },
  waypointCoords: {
    fontSize: 12,
    color: colors.text,
    fontFamily: 'monospace',
  },
  waypointDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  detailText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  remainingBox: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  remainingText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    padding: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmButton: {
    backgroundColor: '#16A34A', // Green
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButtonText: {
    fontWeight: '700',
  },
});
