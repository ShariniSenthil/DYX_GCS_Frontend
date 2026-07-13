// ============================================================
// PointList — DXF Localization Pipeline
// ============================================================
//
// Scrollable list of ParsedPoints using the status-card pattern.
// Each row is tappable; the selected row gets a distinct accent
// border. Auto-scrolls the selected row into view when selectedId
// changes.
//
// Requirements: 10.1, 17.1, 17.3
// ============================================================

import React, { useEffect, useRef } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';
import { ParsedPoint, ParsedPointSet } from '../../core/geometry/parsedPoint';

export interface PointListProps {
  points: ParsedPointSet;
  selectedId: string | null;
  onRowTap: (id: string) => void;
}

export function PointList({
  points,
  selectedId,
  onRowTap,
}: PointListProps): React.ReactElement {
  const flatListRef = useRef<FlatList<ParsedPoint>>(null);

  // Auto-scroll the selected row into view when selectedId changes (Requirement 17.3)
  useEffect(() => {
    if (selectedId === null) return;
    const selectedPoint = points.find((p) => p.id === selectedId);
    if (selectedPoint === undefined) return;
    flatListRef.current?.scrollToItem({ item: selectedPoint, animated: true });
  }, [selectedId, points]);

  function renderItem({ item }: { item: ParsedPoint }): React.ReactElement {
    const isSelected = item.id === selectedId;

    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => onRowTap(item.id)}
        activeOpacity={0.75}
      >
        {/* Left accent bar — mirrors status-card pattern */}
        <View
          style={[
            styles.accentBar,
            { backgroundColor: isSelected ? colors.accent : colors.border },
          ]}
        />

        {/* Row content */}
        <View style={styles.rowInner}>
          {/* ID — small, muted */}
          <Text style={styles.idText}>{item.id}</Text>

          {/* Labels row */}
          <View style={styles.labelsRow}>
            {/* LINE CODE — uppercase label */}
            <View style={styles.labelChip}>
              <Text style={styles.labelText}>LINE CODE</Text>
              <Text style={styles.valueText}>{item.lineCode.toUpperCase()}</Text>
            </View>

            {/* CONTROL CODE — uppercase label, only when non-empty */}
            {item.controlCode !== '' && (
              <View style={styles.labelChip}>
                <Text style={styles.labelText}>CTRL CODE</Text>
                <Text style={styles.valueText}>{item.controlCode.toUpperCase()}</Text>
              </View>
            )}

            {/* ENTITY TYPE */}
            <View style={styles.labelChip}>
              <Text style={styles.labelText}>TYPE</Text>
              <Text style={styles.valueText}>{item.entityType}</Text>
            </View>
          </View>

          {/* Indicator badges row */}
          <View style={styles.badgesRow}>
            {item.isControlPoint && (
              <View style={styles.cpBadge}>
                <View style={styles.cpDot} />
                <Text style={styles.cpBadgeText}>CP</Text>
              </View>
            )}
            {item.isTransformed && (
              <View style={styles.transformedBadge}>
                <View style={styles.transformedDot} />
                <Text style={styles.transformedBadgeText}>XFM</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <FlatList<ParsedPoint>
      ref={flatListRef}
      data={points as ParsedPoint[]}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      onScrollToIndexFailed={() => {
        // Gracefully ignore scroll failures (e.g. item not yet rendered)
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingVertical: 4,
  },

  // Status-card row — backgroundColor: cardBg, borderRadius: 10, borderWidth: 1
  row: {
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  // Selected row — accent border (Requirement 17.3)
  rowSelected: {
    borderColor: colors.accent,
  },

  // Left accent bar — width: 3, alignSelf: 'stretch'
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
  },

  // Inner content area — padding: 10, gap: 6
  rowInner: {
    flex: 1,
    padding: 10,
    gap: 6,
  },

  // ID — small, muted
  idText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },

  // Labels row
  labelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // Individual label chip
  labelChip: {
    gap: 2,
  },

  // Uppercase label — per style guide: rgba(103,232,249,0.8), fontSize:9, fontWeight:'700', letterSpacing:2
  labelText: {
    color: 'rgba(103,232,249,0.8)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },

  // Value text — white, fontSize:12, fontWeight:'700'
  valueText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Badges row
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
  },

  // Control-point badge — green dot + "CP" text
  cpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cpDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  cpBadgeText: {
    color: colors.success,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // Transformed badge — blue dot + "XFM" text
  transformedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  transformedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  transformedBadgeText: {
    color: colors.accent,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
