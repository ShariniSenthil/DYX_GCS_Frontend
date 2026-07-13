import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { colors } from '../../theme/colors';

interface AutoAssignDialogProps {
  visible: boolean;
  missingFields: string[];
  onAutoAssign: () => void;
  onProceedWithout: () => void;
  onCancel: () => void;
}

export const AutoAssignDialog: React.FC<AutoAssignDialogProps> = ({
  visible,
  missingFields,
  onAutoAssign,
  onProceedWithout,
  onCancel,
}) => {
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
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.title}>Missing Assignment Values</Text>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.description}>
              The following fields are not assigned for waypoints:
            </Text>

            {/* Missing Fields List */}
            <View style={styles.missingFieldsBox}>
              {missingFields.map((field) => (
                <View key={field} style={styles.missingFieldRow}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.missingFieldText}>
                    <Text style={styles.fieldName}>{field}</Text> values are missing
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.question}>
              Would you like to automatically assign sequence numbers?
            </Text>

            {/* Auto-Assignment Preview */}
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>Auto-assignment will create:</Text>
              <View style={styles.previewList}>
                {missingFields.includes('Row') && (
                  <Text style={styles.previewItem}>• Row: R1, R2, R3, ... (sequential)</Text>
                )}
                {missingFields.includes('Block') && (
                  <Text style={styles.previewItem}>• Block: B1 (all in one block)</Text>
                )}
                {missingFields.includes('Pile') && (
                  <Text style={styles.previewItem}>• Pile: 1, 2, 3, ... (sequential)</Text>
                )}
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.proceedButton]}
              onPress={onProceedWithout}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Proceed Without</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.autoAssignButton]}
              onPress={onAutoAssign}
              activeOpacity={0.7}
            >
              <Text style={[styles.buttonText, styles.autoAssignButtonText]}>
                Auto-Assign & Continue
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
    padding: 24,
    maxWidth: 500,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.5)', // Yellow border for warning
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  warningIcon: {
    fontSize: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FCD34D', // Yellow text
    flex: 1,
  },
  content: {
    marginBottom: 24,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  missingFieldsBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.5)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  missingFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  bullet: {
    fontSize: 16,
    color: '#FCD34D',
    fontWeight: '700',
  },
  missingFieldText: {
    fontSize: 14,
    color: '#FEF3C7', // Light yellow
    flex: 1,
  },
  fieldName: {
    fontWeight: '700',
    color: '#FCD34D',
  },
  question: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  previewBox: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
    fontWeight: '600',
  },
  previewList: {
    gap: 8,
  },
  previewItem: {
    fontSize: 13,
    color: '#67E8F9', // Cyan
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
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
  proceedButton: {
    backgroundColor: '#1E40AF', // Blue
  },
  autoAssignButton: {
    backgroundColor: '#16A34A', // Green
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  autoAssignButtonText: {
    fontWeight: '700',
  },
});
