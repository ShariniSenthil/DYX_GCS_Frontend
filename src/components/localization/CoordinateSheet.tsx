// ============================================================
// CoordinateSheet — DXF Localization Pipeline
// ============================================================
//
// Bottom sheet for entering real-world latitude and longitude
// for a selected ParsedPoint. Opens iff `point` is non-null.
// Pre-fills existing values when targetLat/targetLon are set.
// Validates input via validateCoords before dispatching.
//
// Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 17.1
// ============================================================

import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { ParsedPoint } from '../../core/geometry/parsedPoint';
import { validateCoords } from './coordinateSheet.helpers';

export interface CoordinateSheetProps {
  point: ParsedPoint | null;
  onConfirm: (lat: number, lon: number) => void;
  onClear: () => void;
  onDismiss: () => void;
}

export function CoordinateSheet({
  point,
  onConfirm,
  onClear,
  onDismiss,
}: CoordinateSheetProps): React.ReactElement {
  const [latText, setLatText] = useState('');
  const [lonText, setLonText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync input fields whenever the selected point changes (Requirement 11.2)
  useEffect(() => {
    if (point !== null) {
      setLatText(point.targetLat !== null ? String(point.targetLat) : '');
      setLonText(point.targetLon !== null ? String(point.targetLon) : '');
      setValidationError(null);
    }
  }, [point]);

  function handleConfirm(): void {
    const lat = parseFloat(latText);
    const lon = parseFloat(lonText);

    if (!validateCoords(lat, lon)) {
      setValidationError(
        'Invalid coordinates. Latitude must be in [-90, 90] and longitude in [-180, 180].'
      );
      return;
    }

    setValidationError(null);
    onConfirm(lat, lon);
  }

  function handleClear(): void {
    setLatText('');
    setLonText('');
    setValidationError(null);
    onClear();
  }

  function handleDismiss(): void {
    setValidationError(null);
    onDismiss();
  }

  return (
    <Modal
      visible={point !== null}
      transparent={true}
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="location" size={16} color={colors.accent} />
              </View>
              <Text style={styles.headerTitle}>ASSIGN COORDINATES</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleDismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Point info */}
          {point !== null && (
            <View style={styles.pointInfo}>
              <Text style={styles.pointInfoLabel}>POINT</Text>
              <Text style={styles.pointInfoValue}>{point.id}</Text>
              {point.lineCode ? (
                <>
                  <Text style={[styles.pointInfoLabel, { marginLeft: 12 }]}>LAYER</Text>
                  <Text style={styles.pointInfoValue}>{point.lineCode}</Text>
                </>
              ) : null}
            </View>
          )}

          {/* Latitude input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>LATITUDE</Text>
            <TextInput
              style={styles.input}
              value={latText}
              onChangeText={(text) => {
                setLatText(text);
                setValidationError(null);
              }}
              placeholder="e.g. 37.7749"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          {/* Longitude input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>LONGITUDE</Text>
            <TextInput
              style={styles.input}
              value={lonText}
              onChangeText={(text) => {
                setLonText(text);
                setValidationError(null);
              }}
              placeholder="e.g. -122.4194"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          {/* Validation error */}
          {validationError !== null && (
            <Text style={styles.errorText}>{validationError}</Text>
          )}

          {/* Action buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.clearBtn]}
              onPress={handleClear}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={16} color={colors.warning} />
              <Text style={[styles.buttonText, { color: colors.warning }]}>CLEAR</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.confirmBtn]}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark" size={16} color="#ffffff" />
              <Text style={[styles.buttonText, { color: '#ffffff' }]}>CONFIRM</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Modal overlay — rgba(0,0,0,0.7) per style guide
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  // Sheet container — panelBg, border, borderRadius 14, padding 24
  sheet: {
    backgroundColor: colors.panelBg,
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Header row
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Point info row
  pointInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pointInfoLabel: {
    color: 'rgba(103,232,249,0.8)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  pointInfoValue: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Input fields
  fieldGroup: {
    marginBottom: 12,
    gap: 6,
  },
  fieldLabel: {
    color: 'rgba(103,232,249,0.8)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  // Input bg: colors.secondary, per Requirement 11.6 and style guide
  input: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 14,
  },

  // Validation error — colors.danger per Requirement 11.4
  errorText: {
    color: colors.danger,
    fontSize: 12,
    marginBottom: 12,
    fontStyle: 'italic',
  },

  // Button row
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  clearBtn: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  // Confirm button — colors.success (#10B981) per Requirement 11.6
  confirmBtn: {
    backgroundColor: colors.success,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
});
