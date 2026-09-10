import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { OptionalGestureDetector } from '../shared/OptionalGestureDetector';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { PathPlanWaypoint } from '../../types/pathplan';
import { vincentyDistance } from '../../utils/missionCalculator';

interface Props {
    waypoints: PathPlanWaypoint[];
    roverPosition?: { lat: number; lon: number } | null;
    /** Injected by DraggableCard (handleType="custom") — gesture object for the header drag handle */
    dragGesture?: any;
    /** True while the card is being dragged — injected by DraggableCard */
    isDraggingActive?: boolean;
    onClose?: () => void;
}

// Calculate area of waypoints using Shoelace formula (approximated to meters)
const calculateArea = (wps: PathPlanWaypoint[]): number => {
    if (wps.length < 3) return 0;
    const latMid = (wps[0].lat * Math.PI) / 180;
    // Meters per degree latitude/longitude approximation
    const mPerLat = 111132.954 - 559.822 * Math.cos(2 * latMid) + 1.175 * Math.cos(4 * latMid);
    const mPerLon = 111412.84 * Math.cos(latMid) - 93.5 * Math.cos(3 * latMid);

    const x = wps.map(wp => (wp.lon - wps[0].lon) * mPerLon);
    const y = wps.map(wp => (wp.lat - wps[0].lat) * mPerLat);

    let area = 0;
    const n = wps.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += x[i] * y[j];
        area -= x[j] * y[i];
    }
    return Math.abs(area) / 2;
};

export const MissionStatistics: React.FC<Props> = ({ waypoints, roverPosition, dragGesture, isDraggingActive, onClose }) => {
    const totalWaypoints = waypoints.length;
    
    // First leg: distance from rover to first waypoint
    const firstLegDistance = (roverPosition && waypoints.length > 0)
        ? vincentyDistance(
            { lat: roverPosition.lat, lon: roverPosition.lon },
            { lat: waypoints[0].lat, lon: waypoints[0].lon }
          )
        : 0;

    const totalDistance = waypoints.reduce((sum, wp) => sum + (wp.distance || 0), 0) + firstLegDistance;
    const totalDistanceM = totalDistance.toFixed(2);

    // Estimate duration at constant speed (1 m/s)
    const totalTimeSeconds = totalDistance / 1;
    const hours = Math.floor(totalTimeSeconds / 3600);
    const minutes = Math.floor((totalTimeSeconds % 3600) / 60);
    const seconds = Math.floor(totalTimeSeconds % 60);

    const durationStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    const computedArea = calculateArea(waypoints);
    const areaStr = computedArea > 0 ? `${computedArea.toFixed(1)} m²` : '—';

    // Gauge calculations
    const isReady = totalWaypoints > 0;
    const gaugeValue = isReady ? 92 : 0;
    const radius = 22;
    const strokeWidth = 4;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (circumference * gaugeValue) / 100;

    return (
        <View style={styles.container}>
            {/* Header — also the drag handle for the floating card */}
            <OptionalGestureDetector gesture={dragGesture}>
                <View style={[styles.header, isDraggingActive && styles.headerDragging]}>
                    <View style={styles.headerLeft}>
                        <View style={styles.headerIconWrap}>
                            <Ionicons name="stats-chart" size={14} color="#67E8F9" />
                        </View>
                        <Text style={styles.headerTitle}>STATISTICS</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <View style={styles.headerBadge}>
                            <View style={[styles.headerBadgeDot, { backgroundColor: isReady ? '#10B981' : '#475569' }]} />
                            <Text style={[styles.headerBadgeText, { color: isReady ? '#10B981' : '#475569' }]}>
                                {isReady ? `${totalWaypoints} PTS` : 'EMPTY'}
                            </Text>
                        </View>
                        {onClose && (
                            <TouchableOpacity style={styles.headerCloseBtn} onPress={onClose} activeOpacity={0.7}>
                                <MaterialCommunityIcons name="close" size={14} color="#94A3B8" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </OptionalGestureDetector>

            {/* Mission Ready Circular Progress Gauge */}
            <View style={styles.gaugeCard}>
                <View style={styles.gaugeWrapper}>
                    <Svg width={54} height={54} viewBox="0 0 54 54">
                        <Circle
                            cx="27"
                            cy="27"
                            r={radius}
                            stroke="#112235"
                            strokeWidth={strokeWidth}
                            fill="transparent"
                        />
                        <Circle
                            cx="27"
                            cy="27"
                            r={radius}
                            stroke="#67E8F9"
                            strokeWidth={strokeWidth}
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            transform="rotate(-90 27 27)"
                        />
                    </Svg>
                    <View style={styles.gaugeTextOverlay}>
                        <Text style={styles.gaugePercentageText}>{gaugeValue}%</Text>
                    </View>
                </View>
                <View style={styles.gaugeInfo}>
                    <Text style={styles.gaugeTitle}>Mission Ready</Text>
                    <Text style={styles.gaugeSubtitle}>All systems nominal. Ready to deploy.</Text>
                </View>
            </View>

            {/* Grid Metrics - 2x2 Grid */}
            <View style={styles.gridContainer}>
                {/* Row 1 */}
                <View style={styles.gridRow}>
                    {/* Marking Points */}
                    <View style={styles.metricBox}>
                        <View style={styles.metricLeft}>
                            <MaterialCommunityIcons name="map-marker-outline" size={16} color="#3B82F6" />
                        </View>
                        <View style={styles.metricRight}>
                            <Text style={styles.metricLabel}>MARKING POINTS</Text>
                            <Text style={styles.metricValue}>{totalWaypoints}</Text>
                        </View>
                    </View>
                    
                    {/* Total Distance */}
                    <View style={styles.metricBox}>
                        <View style={styles.metricLeft}>
                            <MaterialCommunityIcons name="vector-polyline" size={16} color="#10B981" />
                        </View>
                        <View style={styles.metricRight}>
                            <Text style={styles.metricLabel}>TOTAL DISTANCE</Text>
                            <Text style={styles.metricValue}>
                                {totalDistanceM} <Text style={styles.metricUnit}>m</Text>
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Row 2 */}
                <View style={styles.gridRow}>
                    {/* Est Time */}
                    <View style={styles.metricBox}>
                        <View style={styles.metricLeft}>
                            <MaterialCommunityIcons name="clock-outline" size={16} color="#F59E0B" />
                        </View>
                        <View style={styles.metricRight}>
                            <Text style={styles.metricLabel}>EST. TIME</Text>
                            <Text style={styles.metricValue}>{durationStr}</Text>
                        </View>
                    </View>

                    {/* Total Area */}
                    <View style={styles.metricBox}>
                        <View style={styles.metricLeft}>
                            <MaterialCommunityIcons name="grid" size={16} color="#06B6D4" />
                        </View>
                        <View style={styles.metricRight}>
                            <Text style={styles.metricLabel}>TOTAL AREA</Text>
                            <Text style={styles.metricValue}>{areaStr}</Text>
                        </View>
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
        padding: 16,
        gap: 12,
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(103, 232, 249, 0.1)',
    },
    headerDragging: {
        borderBottomColor: 'rgba(103, 232, 249, 0.4)',
        backgroundColor: 'rgba(103, 232, 249, 0.04)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerCloseBtn: {
        width: 20,
        height: 20,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.03)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerIconWrap: {
        width: 24,
        height: 24,
        borderRadius: 6,
        backgroundColor: 'rgba(103, 232, 249, 0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        color: '#E5F1FF',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 2,
    },
    headerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    headerBadgeDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    headerBadgeText: {
        fontSize: 7,
        fontWeight: '700',
        letterSpacing: 1,
    },
    gaugeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#08101a',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(103, 232, 249, 0.1)',
        padding: 12,
        gap: 12,
    },
    gaugeWrapper: {
        position: 'relative',
        width: 54,
        height: 54,
    },
    gaugeTextOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gaugePercentageText: {
        color: '#67E8F9',
        fontSize: 11,
        fontWeight: '700',
    },
    gaugeInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    gaugeTitle: {
        color: '#10B981',
        fontSize: 12,
        fontWeight: '700',
    },
    gaugeSubtitle: {
        color: '#9FBEE3',
        fontSize: 9,
        marginTop: 2,
    },
    gridContainer: {
        flexDirection: 'column',
        gap: 8,
    },
    gridRow: {
        flexDirection: 'row',
        gap: 8,
    },
    metricBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#08101a',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(103, 232, 249, 0.1)',
        padding: 10,
        gap: 8,
    },
    metricLeft: {
        width: 28,
        height: 28,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.03)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    metricRight: {
        flex: 1,
        justifyContent: 'center',
    },
    metricLabel: {
        color: '#9FBEE3',
        fontSize: 7,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    metricValue: {
        color: '#E5F1FF',
        fontSize: 12,
        fontWeight: '700',
        marginTop: 1,
    },
    metricUnit: {
        fontSize: 10,
        color: '#9FBEE3',
        fontWeight: '500',
    },
});
