// ============================================================
// ResidualReporter — DXF Localization Pipeline
// ============================================================
//
// Displays the RMS residual and per-control-point residuals
// after a successful similarity transform solve.
//
// Requirements: 15.2, 15.3, 17.1
// ============================================================

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { ResidualEntry } from '../../core/geometry/parsedPoint';
import { formatResidualMeters } from '../../core/transform/formatResidualMeters';

export interface ResidualReporterProps {
  rmsMeters: number;
  residuals: ResidualEntry[];
}

export function ResidualReporter({
  rmsMeters,
  residuals,
}: ResidualReporterProps): React.ReactElement {
  return (
    <View style={styles.container}>
      {/* Header with RMS */}
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <Ionicons name="analytics" size={16} color={colors.accent} />
        </View>
        <Text style={styles.headerTitle}>RESIDUALS</Text>
        <View style={styles.rmsBadge}>
          <Text style={styles.rmsBadgeLabel}>RMS</Text>
          <Text style={styles.rmsBadgeValue}>{formatResidualMeters(rmsMeters)}</Text>
        </View>
      </View>

      {/* Per-control-point residual list */}
      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {residuals.map((entry) => (
          <View key={entry.controlPointId} style={styles.row}>
            {/* Left accent bar */}
            <View style={styles.accentBar} />

            {/* Row content */}
            <View style={styles.rowInner}>
              {/* Point ID */}
              <View style={styles.labelChip}>
                <Text style={styles.labelText}>POINT</Text>
                <Text style={styles.valueText}>{entry.controlPointId}</Text>
              </View>

              {/* Error */}
              <View style={styles.labelChip}>
                <Text style={styles.labelText}>ERROR</Text>
                <Text style={[styles.valueText, styles.errorValue]}>
                  {formatResidualMeters(entry.errorMeters)}
                </Text>
              </View>

              {/* Predicted ENU */}
              <View style={styles.labelChip}>
                <Text style={styles.labelText}>EAST</Text>
                <Text style={styles.valueText}>{entry.eastMeters.toFixed(2)} m</Text>
              </View>
              <View style={styles.labelChip}>
                <Text style={styles.labelText}>NORTH</Text>
                <Text style={styles.valueText}>{entry.northMeters.toFixed(2)} m</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.panelBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },

  // Header row
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    flex: 1,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3,
  },

  // RMS badge
  rmsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rmsBadgeLabel: {
    color: 'rgba(103,232,249,0.8)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  rmsBadgeValue: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
  },

  // Residual list
  list: {
    maxHeight: 200,
  },

  // Status-card row
  row: {
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
  },
  rowInner: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 12,
  },

  // Label chips
  labelChip: {
    gap: 2,
  },
  labelText: {
    color: 'rgba(103,232,249,0.8)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  valueText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  errorValue: {
    color: colors.success,
  },
});
