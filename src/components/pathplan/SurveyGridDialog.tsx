import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { generateSurveyGrid } from '../../utils/geoPatterns';

interface SurveyGridDialogProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (waypoints: { latitude: number; longitude: number }[]) => void;
  defaultCenter?: { lat: number; lng: number; alt?: number };
}

export const SurveyGridDialog: React.FC<SurveyGridDialogProps> = ({
  visible,
  onClose,
  onGenerate,
  defaultCenter,
}) => {
  const [centerLat, setCenterLat] = useState(
    defaultCenter?.lat?.toString() ?? '13.0764'
  );
  const [centerLng, setCenterLng] = useState(
    defaultCenter?.lng?.toString() ?? '80.1559'
  );
  const [widthM, setWidthM] = useState('100');
  const [heightM, setHeightM] = useState('100');
  const [laneSpacing, setLaneSpacing] = useState('10');
  const [angle, setAngle] = useState('0');
  const [altitude, setAltitude] = useState(
    defaultCenter?.alt?.toString() ?? '30'
  );
  const [overlap, setOverlap] = useState('20');

  // Update when defaultCenter changes
  useEffect(() => {
    if (defaultCenter) {
      setCenterLat(defaultCenter.lat.toString());
      setCenterLng(defaultCenter.lng.toString());
      if (defaultCenter.alt) {
        setAltitude(defaultCenter.alt.toString());
      }
    }
  }, [defaultCenter]);

  // Calculate stats
  const widthNum = parseFloat(widthM) || 0;
  const heightNum = parseFloat(heightM) || 0;
  const spacingNum = parseFloat(laneSpacing) || 1;
  const overlapNum = parseFloat(overlap) || 0;
  const effectiveSpacing = spacingNum * (1 - overlapNum / 100);
  const numLanes = Math.max(2, Math.ceil(widthNum / effectiveSpacing));
  const numWaypoints = numLanes * 2;
  const totalDistance = numLanes * heightNum + (numLanes - 1) * spacingNum;
  const estimatedTime = Math.ceil(totalDistance / 5 / 60); // Assume 5 m/s
  const areaCoverage = ((widthNum * heightNum) / 10000).toFixed(2);

  const handleGenerate = () => {
    const width = parseFloat(widthM);
    const height = parseFloat(heightM);
    const spacing = parseFloat(laneSpacing);

    if (width <= 0 || height <= 0) {
      Alert.alert('Invalid Input', 'Width and height must be positive values');
      return;
    }
    if (spacing <= 0) {
      Alert.alert('Invalid Input', 'Lane spacing must be positive');
      return;
    }
    if (isNaN(parseFloat(centerLat)) || isNaN(parseFloat(centerLng))) {
      Alert.alert('Invalid Input', 'Invalid center coordinates');
      return;
    }

    const waypoints = generateSurveyGrid({
      centerLat: parseFloat(centerLat),
      centerLng: parseFloat(centerLng),
      widthM: width,
      heightM: height,
      laneSpacingM: spacing,
      angleDegree: parseFloat(angle) || 0,
      altitude: parseFloat(altitude) || 30,
      overlapPercent: parseFloat(overlap) || 0,
    });

    onGenerate(
      waypoints.map((wp) => ({ latitude: wp.lat, longitude: wp.lng }))
    );
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerIcon}>📐</Text>
              <Text style={styles.title}>SURVEY GRID GENERATOR</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Lawnmower</Text>
              </View>
            </View>

            {/* Grid Center */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Grid Center</Text>
              <View style={styles.row}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Latitude</Text>
                  <TextInput
                    style={styles.input}
                    value={centerLat}
                    onChangeText={setCenterLat}
                    keyboardType="numeric"
                    placeholder="13.0764"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Longitude</Text>
                  <TextInput
                    style={styles.input}
                    value={centerLng}
                    onChangeText={setCenterLng}
                    keyboardType="numeric"
                    placeholder="80.1559"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            </View>

            {/* Grid Dimensions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Grid Dimensions</Text>
              <View style={styles.row}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Width (m)</Text>
                  <TextInput
                    style={styles.input}
                    value={widthM}
                    onChangeText={setWidthM}
                    keyboardType="numeric"
                    placeholder="100"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Height (m)</Text>
                  <TextInput
                    style={styles.input}
                    value={heightM}
                    onChangeText={setHeightM}
                    keyboardType="numeric"
                    placeholder="100"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            </View>

            {/* Flight Parameters */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Flight Parameters</Text>
              <View style={styles.row}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Lane Spacing (m)</Text>
                  <TextInput
                    style={styles.input}
                    value={laneSpacing}
                    onChangeText={setLaneSpacing}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Overlap (%)</Text>
                  <TextInput
                    style={styles.input}
                    value={overlap}
                    onChangeText={setOverlap}
                    keyboardType="numeric"
                    placeholder="20"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Grid Angle (°)</Text>
                  <TextInput
                    style={styles.input}
                    value={angle}
                    onChangeText={setAngle}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={styles.hint}>0°=N, 90°=E</Text>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Altitude (m)</Text>
                  <TextInput
                    style={styles.input}
                    value={altitude}
                    onChangeText={setAltitude}
                    keyboardType="numeric"
                    placeholder="30"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            </View>

            {/* Statistics */}
            <View style={styles.statsSection}>
              <Text style={styles.statsTitle}>Mission Statistics</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Lanes:</Text>
                  <Text style={styles.statValue}>{numLanes}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Marking points:</Text>
                  <Text style={styles.statValue}>{numWaypoints}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Distance:</Text>
                  <Text style={styles.statValue}>
                    {totalDistance.toFixed(0)} m
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Est. Time:</Text>
                  <Text style={styles.statValue}>{estimatedTime} min</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Area Coverage:</Text>
                  <Text style={styles.statValue}>{areaCoverage} ha</Text>
                </View>
              </View>
            </View>

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                <Text style={styles.infoBold}>ℹ️ Pattern:</Text> Serpentine
                (lawnmower) pattern for efficient coverage. Overlap ensures no
                gaps in sensor/camera coverage.
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.generateBtn}
                onPress={handleGenerate}
                activeOpacity={0.7}
              >
                <Text style={styles.generateText}>✓ Generate Grid</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    padding: 16,
  },
  dialog: {
    backgroundColor: colors.panelBg,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 540,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  headerIcon: {
    fontSize: 24,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1,
    textAlign: 'center',
    flex: 1,
  },
  badge: {
    backgroundColor: colors.greenBtn,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '600',
  },
  section: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  inputGroup: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.cardBg,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statsSection: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  statsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
  },
  statsGrid: {
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
  },
  infoBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  infoText: {
    fontSize: 11,
    color: '#fbbf24',
    lineHeight: 16,
  },
  infoBold: {
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.inputBg,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  generateBtn: {
    flex: 1,
    backgroundColor: colors.greenBtn,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  generateText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
