// ============================================================
// CAD Dimension Editor Dialog Component
// ============================================================
//
// Dialog for editing dimension values with live preview,
// validation, and geometry updates.

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { DimensionAnnotation } from './types/dimension';
import { CADEntity } from '../../core/cad';

interface CADimensionEditorProps {
  /** Whether the editor is visible */
  visible: boolean;

  /** Dimension being edited */
  dimension: DimensionAnnotation | null;

  /** Current entities for preview */
  entities: CADEntity[];

  /** Callback when user confirms edit */
  onApply: (newValue: number) => void;

  /** Callback when user cancels */
  onCancel: () => void;

  /** Validation function */
  validateValue?: (value: number) => boolean;
}

/**
 * Dimension editor dialog with live preview and validation
 */
export const CADimensionEditor: React.FC<CADimensionEditorProps> = ({
  visible,
  dimension,
  entities,
  onApply,
  onCancel,
  validateValue,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [previewValue, setPreviewValue] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Reset input when dimension changes
  useEffect(() => {
    if (dimension) {
      setInputValue(dimension.value.toFixed(3));
      setPreviewValue(null);
      setValidationError(null);
      setShowPreview(false);
    }
  }, [dimension]);

  // Validate input and update preview
  const validateAndUpdatePreview = (text: string) => {
    setInputValue(text);

    const numValue = parseFloat(text);
    setPreviewValue(numValue);

    if (isNaN(numValue)) {
      setValidationError('Invalid number');
      return;
    }

    // Custom validation
    if (validateValue && !validateValue(numValue)) {
      setValidationError('Invalid dimension value');
      return;
    }

    // Basic validation based on dimension type
    let error = null;
    switch (dimension?.type) {
      case 'linear':
      case 'horizontal':
      case 'vertical':
      case 'arc-length':
        if (numValue <= 0) error = 'Distance must be positive';
        break;
      case 'radial':
        if (numValue <= 0) error = 'Radius must be positive';
        break;
      case 'diameter':
        if (numValue <= 0) error = 'Diameter must be positive';
        break;
      case 'angular':
        if (numValue < 0 || numValue > 360) error = 'Angle must be 0-360°';
        break;
      case 'coordinate':
        // Allow any coordinate value
        break;
    }

    setValidationError(error);
    setShowPreview(true);
  };

  const handleApply = () => {
    if (previewValue === null || validationError) {
      Alert.alert('Invalid Value', validationError || 'Please enter a valid number');
      return;
    }

    onApply(previewValue);
    // Reset state
    setInputValue('');
    setPreviewValue(null);
    setValidationError(null);
    setShowPreview(false);
  };

  const handleCancel = () => {
    onCancel();
    // Reset state
    setInputValue('');
    setPreviewValue(null);
    setValidationError(null);
    setShowPreview(false);
  };

  if (!dimension) return null;

  const dimensionIcon = useMemo(() => {
    switch (dimension.type) {
      case 'linear':
      case 'horizontal':
      case 'vertical':
        return 'ruler';
      case 'angular':
        return 'angle-acute';
      case 'radial':
        return 'radius';
      case 'diameter':
        return 'diameter';
      case 'arc-length':
        return 'arc';
      case 'coordinate':
        return 'axis-arrow';
      default:
        return 'ruler';
    }
  }, [dimension.type]);

  const dimensionLabel = useMemo(() => {
    switch (dimension.type) {
      case 'linear':
        return 'Distance';
      case 'horizontal':
        return 'Horizontal Distance';
      case 'vertical':
        return 'Vertical Distance';
      case 'angular':
        return 'Angle';
      case 'radial':
        return 'Radius';
      case 'diameter':
        return 'Diameter';
      case 'arc-length':
        return 'Arc Length';
      case 'coordinate':
        return dimension.metadata?.axis === 'x' ? 'X Coordinate' : 'Y Coordinate';
      default:
        return 'Dimension';
    }
  }, [dimension.type, dimension.metadata]);

  const unitLabel = dimension.unit || 'm';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <MaterialCommunityIcons name={dimensionIcon as any} size={24} color="#67E8F9" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Edit Dimension</Text>
              <Text style={styles.headerSubtitle}>
                {dimensionLabel}: {dimension.label}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleCancel}>
              <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Current Value Display */}
          <View style={styles.currentValueSection}>
            <Text style={styles.currentValueLabel}>Current Value</Text>
            <Text style={styles.currentValueText}>{dimension.label}</Text>
          </View>

          {/* Input Section */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>New Value ({unitLabel})</Text>
            <TextInput
              style={[styles.input, validationError && styles.inputError]}
              value={inputValue}
              onChangeText={validateAndUpdatePreview}
              placeholder={`Enter ${dimensionLabel.toLowerCase()}...`}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleApply}
            />
            {validationError && (
              <Text style={styles.errorText}>{validationError}</Text>
            )}
          </View>

          {/* Preview Info */}
          {showPreview && previewValue !== null && !validationError && (
            <View style={styles.previewSection}>
              <View style={styles.previewInfo}>
                <MaterialCommunityIcons name="eye-outline" size={18} color="#67E8F9" />
                <Text style={styles.previewText}>
                  Preview: {previewValue.toFixed(3)} {unitLabel}
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={handleCancel}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.applyBtn]}
              onPress={handleApply}
              disabled={!!validationError || previewValue === null}
            >
              <MaterialCommunityIcons name="check-bold" size={18} color={colors.text} />
              <Text style={styles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>

          {/* Help Text */}
          <View style={styles.helpSection}>
            <Text style={styles.helpText}>
              💡 Tip: The geometry will update to match the new dimension value.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#1A1D24',
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2D34',
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(103, 232, 249, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.24)',
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E5F1FF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  currentValueSection: {
    padding: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    margin: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  currentValueLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  currentValueText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#22C55E',
  },
  inputSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#252830',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 6,
  },
  previewSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  previewInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(103, 232, 249, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 8,
  },
  previewText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#67E8F9',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
  },
  cancelBtn: {
    backgroundColor: '#252830',
    borderWidth: 1,
    borderColor: '#2A2D34',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  applyBtn: {
    backgroundColor: colors.greenBtn,
  },
  applyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  helpSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },
  helpText: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});