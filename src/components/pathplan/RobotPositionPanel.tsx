import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { OptionalGestureDetector } from '../shared/OptionalGestureDetector';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSmoothedDisplayValue } from '../../hooks/useSmoothedDisplayValue';
import { PATH_PLAN_GLASS } from '../../constants/pathPlanGlass';
import { liveDataStateLabel, type LiveDataState } from '../../utils/liveDataState';

interface Props {
    roverPosition?: { lat: number; lon: number; alt?: number } | null;
    heading?: number | null;
    /** Whether the displayed location is fresh enough for an operator to use. */
    dataState?: LiveDataState;
    /** Injected by DraggableCard (handleType="custom") — gesture object for the header drag handle */
    dragGesture?: any;
    /** True while the card is being dragged — injected by DraggableCard */
    isDraggingActive?: boolean;
    onClose?: () => void;
}

export const RobotPositionPanel: React.FC<Props> = ({ roverPosition, heading, dataState, dragGesture, isDraggingActive, onClose }) => {
    const resolvedDataState: LiveDataState = dataState ?? (roverPosition ? 'live' : 'waiting');
    const hasFix = resolvedDataState === 'live' && !!roverPosition;
    const visiblePosition = hasFix ? roverPosition : null;
    const visibleHeading = hasFix ? heading : null;
    // Smooth only what is shown in the panel. The map, mission control, and
    // telemetry store continue to receive the original rover coordinates.
    const displayLat = useSmoothedDisplayValue(visiblePosition?.lat, {
        timeConstantMs: 320,
        maxJump: 0.0005,
        settleEpsilon: 0.00000001,
    });
    const displayLon = useSmoothedDisplayValue(visiblePosition?.lon, {
        timeConstantMs: 320,
        maxJump: 0.0005,
        settleEpsilon: 0.00000001,
    });
    const displayAlt = useSmoothedDisplayValue(visiblePosition?.alt, {
        timeConstantMs: 300,
        maxJump: 8,
        settleEpsilon: 0.01,
    });
    const displayHeading = useSmoothedDisplayValue(visibleHeading, {
        timeConstantMs: 240,
        maxJump: 120,
        settleEpsilon: 0.05,
        circular: true,
    });

    const latStr = displayLat !== null ? displayLat.toFixed(7) : '—';
    const lonStr = displayLon !== null ? displayLon.toFixed(7) : '—';
    const altStr = displayAlt !== null ? `${displayAlt.toFixed(1)}m` : '—';
    const headingStr = displayHeading !== null ? `${displayHeading.toFixed(0)}°` : '—';

    return (
        <View style={styles.container}>
            {/* Header — also the drag handle for the floating card */}
            <OptionalGestureDetector gesture={dragGesture}>
                <View style={[styles.header, isDraggingActive && styles.headerDragging]}>
                    <View style={styles.headerLeft}>
                        <MaterialCommunityIcons name="robot" size={13} color={PATH_PLAN_GLASS.cyan} />
                        <Text style={styles.headerTitle}>ROBOT POSITION</Text>
                        <View style={[styles.liveDot, { backgroundColor: hasFix ? '#4ade80' : 'rgba(255,255,255,0.3)' }]} />
                        {!hasFix && <Text style={styles.stateText}>{liveDataStateLabel(resolvedDataState)}</Text>}
                    </View>
                    {onClose && (
                        <TouchableOpacity style={styles.headerCloseBtn} onPress={onClose} activeOpacity={0.7}>
                            <MaterialCommunityIcons name="close" size={13} color="#94A3B8" />
                        </TouchableOpacity>
                    )}
                </View>
            </OptionalGestureDetector>

            {/* Two rows — Lat/Lon, Alt/Heading */}
            <View style={styles.statsContainer}>
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>LAT</Text>
                        <Text style={styles.statValue} numberOfLines={1}>{latStr}</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>LON</Text>
                        <Text style={styles.statValue} numberOfLines={1}>{lonStr}</Text>
                    </View>
                </View>
                <View style={styles.rowDivider} />
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>ALT</Text>
                        <Text style={styles.statValue} numberOfLines={1}>{altStr}</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>HDG</Text>
                        <Text style={styles.statValue} numberOfLines={1}>{headingStr}</Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#07111be6',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(103, 232, 249, 0.15)',
        padding: 10,
        gap: 6,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerDragging: {
        backgroundColor: 'rgba(103, 232, 249, 0.04)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerTitle: {
        color: '#E5F1FF',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
    },
    stateText: {
        color: '#94A3B8',
        fontSize: 7,
        fontWeight: '700',
        letterSpacing: 0.4,
    },
    liveDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    headerCloseBtn: {
        width: 16,
        height: 16,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.03)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsContainer: {
        backgroundColor: '#08101a',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(103, 232, 249, 0.1)',
        overflow: 'hidden',
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8,
    },
    rowDivider: {
        height: 1,
        backgroundColor: 'rgba(103, 232, 249, 0.1)',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        height: 18,
        backgroundColor: 'rgba(103, 232, 249, 0.1)',
    },
    statLabel: {
        color: '#9FBEE3',
        fontSize: 7,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    statValue: {
        color: '#E5F1FF',
        fontSize: 10,
        fontWeight: '700',
        fontFamily: 'monospace',
        marginTop: 1,
    },
});
