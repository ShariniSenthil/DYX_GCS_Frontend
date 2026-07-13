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
import { generateCircleWaypoints } from '../../utils/geoPatterns';

interface CircleGeneratorDialogProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (waypoints: { latitude: number; longitude: number }[]) => void;
  defaultCenter?: { lat: number; lng: number; alt?: number };
}

export const CircleGeneratorDialog: React.FC<CircleGeneratorDialogProps> = ({
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
  const [radius, setRadius] = useState('30');
  const [points, setPoints] = useState('12');
  const [altitude, setAltitude] = useState(
    defaultCenter?.alt?.toString() ?? '30'
  );
  const [startAngle, setStartAngle] = useState('0');
  const [clockwise, setClockwise] = useState(true);

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
  const radiusNum = parseFloat(radius) || 0;
  const pointsNum = parseInt(points) || 0;
  const circumference = 2 * Math.PI * radiusNum;
  const spacing = pointsNum > 0 ? circumference / pointsNum : 0;

  const handleGenerate = () => {
    const numPoints = parseInt(points);
    const radiusM = parseFloat(radius);

    if (numPoints < 3) {
      Alert.alert('Invalid Input', 'At least 3 marking points required');
      return;
    }
    if (radiusM <= 0) {
      Alert.alert('Invalid Input', 'Radius must be positive');
      return;
    }
    if (isNaN(parseFloat(centerLat)) || isNaN(parseFloat(centerLng))) {
      Alert.alert('Invalid Input', 'Invalid center coordinates');
      return;
    }

    const waypoints = generateCircleWaypoints({
      centerLat: parseFloat(centerLat),
      centerLng: parseFloat(centerLng),
      radiusM: radiusM,
      numPoints: numPoints,
      altitude: parseFloat(altitude) || 30,
      startAngleDeg: parseFloat(startAngle) || 0,
      clockwise: clockwise,
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
              <Text style={styles.headerIcon}>🌀</Text>
              <Text style={styles.title}>CIRCLE MISSION GENERATOR</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Enhanced</Text>
              </View>
            </View>

            {/* Center Point Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Circle Center</Text>
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

            {/* Circle Parameters */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Circle Parameters</Text>
              <View style={styles.row}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Radius (m)</Text>
                  <TextInput
                    style={styles.input}
                    value={radius}
                    onChangeText={setRadius}
                    keyboardType="numeric"
                    placeholder="30"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Waypoints</Text>
                  <TextInput
                    style={styles.input}
                    value={points}
                    onChangeText={setPoints}
                    keyboardType="numeric"
                    placeholder="12"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Start Angle (°)</Text>
                  <TextInput
                    style={styles.input}
                    value={startAngle}
                    onChangeText={setStartAngle}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={styles.hint}>0°=North</Text>
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

            {/* Direction Control */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Direction</Text>
              <View style={styles.directionRow}>
                <TouchableOpacity
                  style={[
                    styles.directionBtn,
                    clockwise && styles.directionBtnActive,
                  ]}
                  onPress={() => setClockwise(true)}
                >
                  <Text
                    style={[
                      styles.directionText,
                      clockwise && styles.directionTextActive,
                    ]}
                  >
                    ↻ Clockwise
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.directionBtn,
                    !clockwise && styles.directionBtnActive,
                  ]}
                  onPress={() => setClockwise(false)}
                >
                  <Text
                    style={[
                      styles.directionText,
                      !clockwise && styles.directionTextActive,
                    ]}
                  >
                    ↺ Counter-CW
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Statistics */}
            <View style={styles.statsSection}>
              <Text style={styles.statsTitle}>Circle Statistics</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Circumference:</Text>
                  <Text style={styles.statValue}>{circumference.toFixed(1)} m</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>WP Spacing:</Text>
                  <Text style={styles.statValue}>{spacing.toFixed(1)} m</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Waypoints:</Text>
                  <Text style={styles.statValue}>
                    {pointsNum + 1} (incl. close)
                  </Text>
                </View>
              </View>
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
                <Text style={styles.generateText}>✓ Generate Circle</Text>
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
    maxWidth: 500,
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
    backgroundColor: colors.blueBtn,
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
  directionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  directionBtn: {
    flex: 1,
    backgroundColor: colors.cardBg,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  directionBtnActive: {
    backgroundColor: colors.blueBtn,
    borderColor: colors.accent,
  },
  directionText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  directionTextActive: {
    color: colors.text,
  },
  statsSection: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
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
