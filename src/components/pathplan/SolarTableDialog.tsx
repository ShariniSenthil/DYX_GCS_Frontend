import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Alert,
  SafeAreaView,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { colors } from '../../theme/colors';
import {
  SolarTableParams,
  SolarTemplate,
  LocalPile,
  RefPoint,
  generateLocalGrid,
  estimateTotalPiles,
  estimateArea,
  applyGeoReference,
  validateRefPoint,
  vincentyDestinationPoint,
} from '../../utils/solarTableGenerator';
import { vincentyDistance } from '../../utils/missionCalculator';
import { TemplateStorage } from '../../services/TemplateStorage';

// ─── Props ──────────────────────────────────────────────────

interface SolarTableDialogProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (coords: { latitude: number; longitude: number }[]) => void;
  defaultCenter?: { lat: number; lng: number };
  initialParams?: SolarTableParams;
  startAtStep?: 2;
}

// ─── String-based param state ───────────────────────────────

interface ParamStrings {
  pointSpacing: string;
  tableGap: string;
  rowSpacing: string;
  tablesPerRow: string;
  rowCount: string;
}

interface ParamErrors {
  pointSpacing?: string;
  tableGap?: string;
  rowSpacing?: string;
  tablesPerRow?: string;
  rowCount?: string;
}

const DEFAULT_PARAM_STRINGS: ParamStrings = {
  pointSpacing: '2.5',
  tableGap: '1.0',
  rowSpacing: '8.0',
  tablesPerRow: '10',
  rowCount: '20',
};

const MOCK_BEARING_MAP = { N: 0, E: 90, S: 180, W: 270 } as const;
type MockDirection = 'N' | 'E' | 'S' | 'W';

const PILE_RADIUS = 8;
const PILE_HIT_SLOP = 14;

// ─── Component ───────────────────────────────────────────────

export const SolarTableDialog: React.FC<SolarTableDialogProps> = ({
  visible,
  onClose,
  onGenerate,
  defaultCenter,
  initialParams,
  startAtStep,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(startAtStep ?? 1);
  const [tableType, setTableType] = useState<6 | 10 | 11>(initialParams?.tableType ?? 6);
  const [paramStrings, setParamStrings] = useState<ParamStrings>(
    initialParams
      ? {
          pointSpacing: String(initialParams.pointSpacing),
          tableGap: String(initialParams.tableGap),
          rowSpacing: String(initialParams.rowSpacing),
          tablesPerRow: String(initialParams.tablesPerRow),
          rowCount: String(initialParams.rowCount),
        }
      : { ...DEFAULT_PARAM_STRINGS },
  );
  const [paramErrors, setParamErrors] = useState<ParamErrors>({});
  const [localGrid, setLocalGrid] = useState<LocalPile[]>([]);
  const [refPoints, setRefPoints] = useState<RefPoint[]>([]);
  const [selectedPileIndex, setSelectedPileIndex] = useState<number | null>(null);
  const [showPointDialog, setShowPointDialog] = useState(false);
  const [entryLat, setEntryLat] = useState('');
  const [entryLon, setEntryLon] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [mockMode, setMockMode] = useState(false);
  const [mockDirection, setMockDirection] = useState<MockDirection>('N');

  // Sync initialParams when opening with a template
  useEffect(() => {
    if (visible && initialParams) {
      setTableType(initialParams.tableType);
      setParamStrings({
        pointSpacing: String(initialParams.pointSpacing),
        tableGap: String(initialParams.tableGap),
        rowSpacing: String(initialParams.rowSpacing),
        tablesPerRow: String(initialParams.tablesPerRow),
        rowCount: String(initialParams.rowCount),
      });
      setStep(startAtStep ?? 2);
      setRefPoints([]);
      setLocalGrid(generateLocalGrid(initialParams));
    }
  }, [visible, initialParams, startAtStep]);

  // ─── Parse & validate params ─────────────────────────────

  const parseParams = (): SolarTableParams | null => {
    const newErrors: ParamErrors = {};
    const pointSpacing = parseFloat(paramStrings.pointSpacing);
    const tableGap = parseFloat(paramStrings.tableGap);
    const rowSpacing = parseFloat(paramStrings.rowSpacing);
    const tablesPerRow = parseInt(paramStrings.tablesPerRow, 10);
    const rowCount = parseInt(paramStrings.rowCount, 10);

    if (isNaN(pointSpacing) || pointSpacing <= 0) newErrors.pointSpacing = 'Enter a value greater than 0';
    if (isNaN(tableGap) || tableGap <= 0) newErrors.tableGap = 'Enter a value greater than 0';
    if (isNaN(rowSpacing) || rowSpacing <= 0) newErrors.rowSpacing = 'Enter a value greater than 0';
    if (isNaN(tablesPerRow) || tablesPerRow < 1) newErrors.tablesPerRow = 'Enter a whole number ≥ 1';
    if (isNaN(rowCount) || rowCount < 1) newErrors.rowCount = 'Enter a whole number ≥ 1';

    setParamErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return null;

    const parsed: SolarTableParams = {
      tableType,
      pointSpacing,
      tableGap,
      rowSpacing,
      tablesPerRow,
      rowCount,
    };

    if (estimateTotalPiles(parsed) > 5000) {
      Alert.alert('Too Many Piles', 'Total piles exceeds 5000 limit. Reduce parameters.');
      return null;
    }

    return parsed;
  };

  // ─── Live preview values from strings ────────────────────

  const previewPiles = useMemo(() => {
    const t = parseInt(paramStrings.tablesPerRow, 10);
    const r = parseInt(paramStrings.rowCount, 10);
    if (isNaN(t) || isNaN(r) || t < 1 || r < 1) return '—';
    return (tableType * t * r).toLocaleString();
  }, [tableType, paramStrings.tablesPerRow, paramStrings.rowCount]);

  const previewGridWidth = useMemo(() => {
    const sp = parseFloat(paramStrings.pointSpacing);
    const gap = parseFloat(paramStrings.tableGap);
    const tpr = parseInt(paramStrings.tablesPerRow, 10);
    if (isNaN(sp) || isNaN(gap) || isNaN(tpr) || tpr < 1) return '—';
    const w = tpr * ((tableType - 1) * sp + gap) - gap;
    return `${w.toFixed(1)} m`;
  }, [tableType, paramStrings.pointSpacing, paramStrings.tableGap, paramStrings.tablesPerRow]);

  const previewGridHeight = useMemo(() => {
    const rs = parseFloat(paramStrings.rowSpacing);
    const rc = parseInt(paramStrings.rowCount, 10);
    if (isNaN(rs) || isNaN(rc) || rc < 1) return '—';
    return `${((rc - 1) * rs).toFixed(1)} m`;
  }, [paramStrings.rowSpacing, paramStrings.rowCount]);

  const previewArea = useMemo(() => {
    const sp = parseFloat(paramStrings.pointSpacing);
    const gap = parseFloat(paramStrings.tableGap);
    const tpr = parseInt(paramStrings.tablesPerRow, 10);
    const rs = parseFloat(paramStrings.rowSpacing);
    const rc = parseInt(paramStrings.rowCount, 10);
    if ([sp, gap, tpr, rs, rc].some((v) => isNaN(v) || v <= 0)) return '—';
    const w = tpr * ((tableType - 1) * sp + gap) - gap;
    const h = (rc - 1) * rs;
    const a = Math.max(0, w * h);
    return a < 10000 ? `${a.toFixed(0)} m²` : `${(a / 10000).toFixed(2)} ha`;
  }, [tableType, paramStrings]);

  // ─── Canvas scale ───────────────────────────────────────

  const gridWidth = useMemo(() => {
    if (localGrid.length === 0) return 1;
    return Math.max(...localGrid.map((p) => p.localX));
  }, [localGrid]);

  const gridHeight = useMemo(() => {
    if (localGrid.length === 0) return 1;
    return Math.max(...localGrid.map((p) => p.localY));
  }, [localGrid]);

  const screenWidth = Dimensions.get('window').width;
  const canvasWidth = screenWidth - 48;
  const scaleX = canvasWidth / (gridWidth || 1);
  const scaleY = (Dimensions.get('window').height * 0.4) / (gridHeight || 1);
  const scale = Math.min(scaleX, scaleY, 12);

  // ─── Handlers ───────────────────────────────────────────

  const handleNext = () => {
    const parsed = parseParams();
    if (!parsed) return;
    const grid = generateLocalGrid(parsed);
    setLocalGrid(grid);

    if (mockMode) {
      const origin = defaultCenter ?? { lat: 0, lng: 0 };
      const bearing = MOCK_BEARING_MAP[mockDirection];
      const dest = vincentyDestinationPoint(origin.lat, origin.lng, bearing, 100);
      const mockRefPoints: RefPoint[] = [
        { pileIndex: 0, lat: origin.lat, lon: origin.lng, valid: true, deviationM: 0 },
        { pileIndex: 1, lat: dest.lat, lon: dest.lon, valid: true, deviationM: 0 },
      ];
      setRefPoints(mockRefPoints);
      setStep(3);
    } else {
      setStep(2);
    }
  };

  const handleBackFromStep2 = () => {
    if (refPoints.length > 0) {
      Alert.alert(
        'Go Back?',
        'Going back will clear your reference points. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go Back & Clear',
            style: 'destructive',
            onPress: () => {
              setRefPoints([]);
              setSelectedPileIndex(null);
              setStep(1);
            },
          },
        ],
      );
    } else {
      setStep(1);
    }
  };

  const handlePilePress = (pileIndex: number) => {
    setSelectedPileIndex(pileIndex);
    const existing = refPoints.find((rp) => rp.pileIndex === pileIndex);
    if (existing) {
      setEntryLat(existing.lat.toString());
      setEntryLon(existing.lon.toString());
    } else {
      setEntryLat(defaultCenter?.lat?.toString() ?? '');
      setEntryLon(defaultCenter?.lng?.toString() ?? '');
    }
    setShowPointDialog(true);
  };

  const handleSavePoint = () => {
    if (selectedPileIndex === null) return;
    const lat = parseFloat(entryLat);
    const lon = parseFloat(entryLon);
    if (isNaN(lat) || isNaN(lon)) return;

    const validation = refPoints.length >= 1
      ? validateRefPoint(lat, lon, selectedPileIndex, localGrid, refPoints)
      : { valid: true, deviationM: 0, deviationCm: 0, status: 'valid' as const };

    const newRefPoint: RefPoint = {
      pileIndex: selectedPileIndex,
      lat,
      lon,
      valid: validation.valid,
      deviationM: validation.deviationM,
    };

    setRefPoints((prev) => {
      const filtered = prev.filter((rp) => rp.pileIndex !== selectedPileIndex);
      return [...filtered, newRefPoint];
    });
    setShowPointDialog(false);
    setSelectedPileIndex(null);
    setEntryLat('');
    setEntryLon('');
  };

  const handleClearPoint = (pileIndex: number) => {
    setRefPoints((prev) => prev.filter((rp) => rp.pileIndex !== pileIndex));
  };

  const handleGenerate = () => {
    if (refPoints.length < 2) return;
    const hasInvalid = refPoints.some((rp) => !rp.valid);
    if (hasInvalid) return;

    const georef = applyGeoReference(localGrid, refPoints);
    if (georef.length === 0) {
      Alert.alert('Generate Failed', 'No waypoints produced. Check reference points.');
      return;
    }
    const coords = georef.map((c) => ({ latitude: c.lat, longitude: c.lon }));
    onGenerate(coords);
    handleClose();
  };

  const handleSaveTemplateAndGenerate = async () => {
    const parsed = parseParams();
    if (!parsed) return;

    const totalPiles = estimateTotalPiles(parsed);
    const areaM2 = estimateArea(parsed);

    const template: SolarTemplate = {
      id: Date.now().toString(),
      name: templateName.trim() || `Solar ${tableType}pt — ${new Date().toLocaleDateString()}`,
      params: parsed,
      totalPiles,
      estimatedAreaM2: areaM2,
      createdAt: new Date().toISOString(),
    };

    try {
      await TemplateStorage.saveTemplate(template);
      handleGenerate();
    } catch (err) {
      Alert.alert(
        'Save Failed',
        err instanceof Error ? err.message : 'Could not save template.',
        [
          { text: 'Try Again', onPress: handleSaveTemplateAndGenerate },
          { text: 'Skip & Import', onPress: handleGenerate },
        ],
      );
    }
  };

  const handleClose = () => {
    setStep(1);
    setTableType(6);
    setParamStrings({ ...DEFAULT_PARAM_STRINGS });
    setParamErrors({});
    setLocalGrid([]);
    setRefPoints([]);
    setSelectedPileIndex(null);
    setShowPointDialog(false);
    setEntryLat('');
    setEntryLon('');
    setTemplateName('');
    setMockMode(false);
    setMockDirection('N');
    onClose();
  };

  // ─── Pile color ─────────────────────────────────────────

  const getPileColor = (pileIndex: number): string => {
    const rp = refPoints.find((r) => r.pileIndex === pileIndex);
    if (rp) {
      if (rp.valid) return colors.greenBtn;
      return colors.redBtn;
    }
    return colors.inputBg;
  };

  // ─── Ref point inter-distances ──────────────────────────

  const refDistances = useMemo(() => {
    const results: Array<{
      from: number;
      to: number;
      expectedM: number;
      actualM: number;
      errorCm: number;
      status: 'valid' | 'warning' | 'error';
    }> = [];

    if (refPoints.length < 2) return results;

    for (let i = 0; i < refPoints.length - 1; i++) {
      const from = refPoints[i];
      const to = refPoints[i + 1];
      const fromPile = localGrid.find((p) => p.pileIndex === from.pileIndex);
      const toPile = localGrid.find((p) => p.pileIndex === to.pileIndex);

      if (fromPile && toPile) {
        const dx = toPile.localX - fromPile.localX;
        const dy = toPile.localY - fromPile.localY;
        const expectedM = Math.sqrt(dx * dx + dy * dy);
        const actualM = vincentyDistance(
          { lat: from.lat, lon: from.lon },
          { lat: to.lat, lon: to.lon },
        );
        const errorCm = Math.abs(actualM - expectedM) * 100;
        const status: 'valid' | 'warning' | 'error' =
          errorCm < 20 ? 'valid' : errorCm < 100 ? 'warning' : 'error';
        results.push({ from: from.pileIndex, to: to.pileIndex, expectedM, actualM, errorCm, status });
      }
    }
    return results;
  }, [refPoints, localGrid]);

  // ─── Live validation for point entry ─────────────────────

  const liveValidation = useMemo(() => {
    if (selectedPileIndex === null || refPoints.length === 0) return null;
    const lat = parseFloat(entryLat);
    const lon = parseFloat(entryLon);
    if (isNaN(lat) || isNaN(lon)) return null;
    return validateRefPoint(lat, lon, selectedPileIndex, localGrid, refPoints);
  }, [selectedPileIndex, entryLat, entryLon, refPoints, localGrid]);

  const validRefCount = refPoints.filter((rp) => rp.valid).length;
  const canGenerate = refPoints.length >= 2 && validRefCount >= 2;

  // ─── Format helpers ─────────────────────────────────────

  const formatNumber = (n: number): string => n.toLocaleString();
  const getPileLabel = (pileIndex: number): string => {
    const pile = localGrid.find((p) => p.pileIndex === pileIndex);
    return pile ? pile.label : `#${pileIndex}`;
  };

  const totalPiles = localGrid.length > 0 ? localGrid.length : 0;
  const areaM2 = localGrid.length > 0 ? estimateArea({
    tableType,
    pointSpacing: parseFloat(paramStrings.pointSpacing) || 0,
    tableGap: parseFloat(paramStrings.tableGap) || 0,
    rowSpacing: parseFloat(paramStrings.rowSpacing) || 0,
    tablesPerRow: parseInt(paramStrings.tablesPerRow, 10) || 0,
    rowCount: parseInt(paramStrings.rowCount, 10) || 0,
  }) : 0;

  // ─── Step header title ──────────────────────────────────

  const stepTitle = step === 1
    ? 'Solar Table Generator'
    : step === 2
    ? 'Set Reference Points'
    : 'Save Template';

  // ─── Render ──────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={handleClose} style={styles.headerClose} activeOpacity={0.7}>
            <Text style={styles.headerCloseText}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{stepTitle}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Step content fills remaining space */}
        <View style={styles.stepContent}>
          {/* ─── STEP 1: Params Form ─── */}
          {step === 1 && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {/* Table Type Selector */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Table Type</Text>
                <View style={styles.typeRow}>
                  {([6, 10, 11] as const).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.typeBtn, tableType === type && styles.typeBtnActive]}
                      onPress={() => setTableType(type)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.typeBtnText, tableType === type && styles.typeBtnTextActive]}>
                        {type} Piles
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Spacing Inputs */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Spacing & Layout</Text>
                <View style={styles.row}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Point Spacing (m)</Text>
                    <TextInput
                      style={[styles.input, paramErrors.pointSpacing && styles.inputError]}
                      value={paramStrings.pointSpacing}
                      onChangeText={(v) => {
                        setParamStrings((p) => ({ ...p, pointSpacing: v }));
                        setParamErrors((e) => ({ ...e, pointSpacing: undefined }));
                      }}
                      keyboardType="numeric"
                      placeholder="2.5"
                      placeholderTextColor={colors.textSecondary}
                    />
                    {paramErrors.pointSpacing && (
                      <Text style={styles.fieldError}>{paramErrors.pointSpacing}</Text>
                    )}
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Table Gap (m)</Text>
                    <TextInput
                      style={[styles.input, paramErrors.tableGap && styles.inputError]}
                      value={paramStrings.tableGap}
                      onChangeText={(v) => {
                        setParamStrings((p) => ({ ...p, tableGap: v }));
                        setParamErrors((e) => ({ ...e, tableGap: undefined }));
                      }}
                      keyboardType="numeric"
                      placeholder="1.0"
                      placeholderTextColor={colors.textSecondary}
                    />
                    {paramErrors.tableGap && (
                      <Text style={styles.fieldError}>{paramErrors.tableGap}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Row Spacing (m)</Text>
                    <TextInput
                      style={[styles.input, paramErrors.rowSpacing && styles.inputError]}
                      value={paramStrings.rowSpacing}
                      onChangeText={(v) => {
                        setParamStrings((p) => ({ ...p, rowSpacing: v }));
                        setParamErrors((e) => ({ ...e, rowSpacing: undefined }));
                      }}
                      keyboardType="numeric"
                      placeholder="8.0"
                      placeholderTextColor={colors.textSecondary}
                    />
                    {paramErrors.rowSpacing && (
                      <Text style={styles.fieldError}>{paramErrors.rowSpacing}</Text>
                    )}
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Tables per Row</Text>
                    <TextInput
                      style={[styles.input, paramErrors.tablesPerRow && styles.inputError]}
                      value={paramStrings.tablesPerRow}
                      onChangeText={(v) => {
                        setParamStrings((p) => ({ ...p, tablesPerRow: v }));
                        setParamErrors((e) => ({ ...e, tablesPerRow: undefined }));
                      }}
                      keyboardType="numeric"
                      placeholder="10"
                      placeholderTextColor={colors.textSecondary}
                    />
                    {paramErrors.tablesPerRow && (
                      <Text style={styles.fieldError}>{paramErrors.tablesPerRow}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Row Count</Text>
                    <TextInput
                      style={[styles.input, paramErrors.rowCount && styles.inputError]}
                      value={paramStrings.rowCount}
                      onChangeText={(v) => {
                        setParamStrings((p) => ({ ...p, rowCount: v }));
                        setParamErrors((e) => ({ ...e, rowCount: undefined }));
                      }}
                      keyboardType="numeric"
                      placeholder="20"
                      placeholderTextColor={colors.textSecondary}
                    />
                    {paramErrors.rowCount && (
                      <Text style={styles.fieldError}>{paramErrors.rowCount}</Text>
                    )}
                  </View>
                  <View style={styles.inputGroup} />
                </View>
              </View>

              {/* Mock Mode Toggle */}
              <View style={styles.mockModeRow}>
                <View style={styles.mockModeLeft}>
                  <Text style={styles.mockModeTitle}>Mock Mode</Text>
                  <Text style={styles.mockModeSubtitle}>
                    Use rover position as origin. Skip GPS reference points.
                  </Text>
                </View>
                <Switch
                  value={mockMode}
                  onValueChange={setMockMode}
                  trackColor={{ false: colors.border, true: colors.greenBtn }}
                  thumbColor={colors.text}
                />
              </View>

              {/* Direction selector — only when mock mode on */}
              {mockMode && (
                <View style={styles.directionSelector}>
                  <Text style={styles.label}>Grid Direction (bearing)</Text>
                  <View style={styles.directionButtons}>
                    {(['N', 'E', 'S', 'W'] as const).map((dir) => (
                      <TouchableOpacity
                        key={dir}
                        style={[styles.directionBtn, mockDirection === dir && styles.directionBtnActive]}
                        onPress={() => setMockDirection(dir)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.directionBtnText}>
                          {dir === 'N' ? 'North' : dir === 'E' ? 'East' : dir === 'S' ? 'South' : 'West'}
                        </Text>
                        <Text style={styles.directionDeg}>{MOCK_BEARING_MAP[dir]}°</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.mockOriginCard}>
                    {defaultCenter ? (
                      <Text style={styles.mockOriginText}>
                        Origin: Rover position ({defaultCenter.lat.toFixed(6)}, {defaultCenter.lng.toFixed(6)})
                      </Text>
                    ) : (
                      <Text style={styles.mockOriginWarning}>
                        Rover offline — using (0.000000, 0.000000) as origin
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Live Preview */}
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>📊 Preview</Text>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Total Piles:</Text>
                  <Text style={styles.previewValue}>{previewPiles}</Text>
                </View>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Grid Width:</Text>
                  <Text style={styles.previewValue}>{previewGridWidth}</Text>
                </View>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Grid Height:</Text>
                  <Text style={styles.previewValue}>{previewGridHeight}</Text>
                </View>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Est. Area:</Text>
                  <Text style={styles.previewValue}>{previewArea}</Text>
                </View>
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextBtn}
                  onPress={handleNext}
                  activeOpacity={0.7}
                >
                  <Text style={styles.nextText}>Next →</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ─── STEP 2: CAD Preview + Reference Points ─── */}
          {step === 2 && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.subtitle}>Set Reference Points</Text>
              <Text style={styles.hint}>Tap any pile to enter GPS coordinates</Text>

              {/* CAD Canvas */}
              <View style={styles.canvasContainer}>
                <ScrollView horizontal maximumZoomScale={3} minimumZoomScale={0.5}>
                  <View style={[styles.canvas, { width: gridWidth * scale + 40, height: gridHeight * scale + 40 }]}>
                    {localGrid.map((pile) => {
                      const isRefPoint = refPoints.some((rp) => rp.pileIndex === pile.pileIndex);
                      const color = getPileColor(pile.pileIndex);
                      const isSelected = selectedPileIndex === pile.pileIndex;

                      return (
                        <TouchableOpacity
                          key={pile.pileIndex}
                          hitSlop={{ top: PILE_HIT_SLOP, bottom: PILE_HIT_SLOP, left: PILE_HIT_SLOP, right: PILE_HIT_SLOP }}
                          style={{
                            position: 'absolute',
                            left: pile.localX * scale + 20 - PILE_RADIUS,
                            top: (gridHeight - pile.localY) * scale + 20 - PILE_RADIUS,
                            width: PILE_RADIUS * 2,
                            height: PILE_RADIUS * 2,
                            borderRadius: PILE_RADIUS,
                            backgroundColor: color,
                            borderWidth: isRefPoint ? 2 : isSelected ? 2 : 0,
                            borderColor: isSelected ? colors.accent : colors.greenBtn,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                          onPress={() => handlePilePress(pile.pileIndex)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.pileNumber}>{pile.pileInTable + 1}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* Reference Points Status */}
              {refPoints.length > 0 && (
                <View style={styles.refSection}>
                  <Text style={styles.sectionTitle}>Reference Points</Text>
                  {refPoints.map((rp) => {
                    const pile = localGrid.find((p) => p.pileIndex === rp.pileIndex);
                    const statusIcon = rp.valid ? '✅' : '❌';
                    const deviationCm = rp.deviationM * 100;
                    return (
                      <View key={rp.pileIndex} style={styles.refCard}>
                        <Text style={styles.refTitle}>
                          {statusIcon} Pile #{rp.pileIndex} ({pile?.label ?? '—'})
                        </Text>
                        <Text style={styles.refCoords}>
                          Lat: {rp.lat.toFixed(6)}  Lon: {rp.lon.toFixed(6)}
                        </Text>
                        {rp.pileIndex !== refPoints[0].pileIndex && (
                          <Text style={styles.refDeviation}>
                            Deviation: {deviationCm < 100 ? `${deviationCm.toFixed(1)} cm` : `${rp.deviationM.toFixed(2)} m`} {statusIcon}
                          </Text>
                        )}
                        <TouchableOpacity onPress={() => handleClearPoint(rp.pileIndex)} activeOpacity={0.7}>
                          <Text style={styles.clearText}>✕ Clear</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Inter-distances */}
              {refDistances.length > 0 && (
                <View style={styles.distSection}>
                  {refDistances.map((d, i) => (
                    <View key={i} style={styles.distCard}>
                      <Text style={styles.distTitle}>P{d.from} → P{d.to}</Text>
                      <Text style={styles.distValue}>Expected: {d.expectedM.toFixed(3)} m</Text>
                      <Text style={styles.distValue}>Actual: {d.actualM.toFixed(3)} m</Text>
                      <Text style={[
                        styles.distValue,
                        d.status === 'valid' && styles.distValid,
                        d.status === 'warning' && styles.distWarning,
                        d.status === 'error' && styles.distError,
                      ]}>
                        Error: {d.errorCm.toFixed(1)} cm {d.status === 'valid' ? '✅' : d.status === 'warning' ? '⚠️' : '❌'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Generate Button */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleBackFromStep2} activeOpacity={0.7}>
                  <Text style={styles.cancelText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.generateBtn, !canGenerate && styles.generateBtnDisabled]}
                  onPress={() => canGenerate ? setStep(3) : undefined}
                  disabled={!canGenerate}
                  activeOpacity={0.7}
                >
                  <Text style={styles.generateText}>
                    ⚡ Generate {formatNumber(totalPiles)} Waypoints →
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ─── STEP 3: Save Template ─── */}
          {step === 3 && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Template Name</Text>
                <TextInput
                  style={styles.input}
                  value={templateName}
                  onChangeText={setTemplateName}
                  placeholder="e.g. Solar Farm A — 6pt"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Summary Card */}
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>📋 Summary</Text>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Table Type:</Text>
                  <Text style={styles.previewValue}>{tableType} Piles</Text>
                </View>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Point Spacing:</Text>
                  <Text style={styles.previewValue}>{paramStrings.pointSpacing} m</Text>
                </View>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Table Gap:</Text>
                  <Text style={styles.previewValue}>{paramStrings.tableGap} m</Text>
                </View>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Row Spacing:</Text>
                  <Text style={styles.previewValue}>{paramStrings.rowSpacing} m</Text>
                </View>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Tables/Row:</Text>
                  <Text style={styles.previewValue}>{paramStrings.tablesPerRow}</Text>
                </View>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Rows:</Text>
                  <Text style={styles.previewValue}>{paramStrings.rowCount}</Text>
                </View>
                <View style={styles.previewGrid}>
                  <Text style={styles.previewLabel}>Total Piles:</Text>
                  <Text style={styles.previewValue}>{formatNumber(totalPiles)}</Text>
                </View>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveTemplateAndGenerate}
                  activeOpacity={0.7}
                >
                  <Text style={styles.saveText}>💾 Save Template & Import</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.skipBtn}
                  onPress={handleGenerate}
                  activeOpacity={0.7}
                >
                  <Text style={styles.skipText}>⚡ Skip & Import Now</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>

        {/* ─── Point Entry Overlay (no nested Modal) ─── */}
        {showPointDialog && selectedPileIndex !== null && (
          <View style={styles.pointEntryOverlay}>
            <View style={styles.pointEntryCard}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <Text style={styles.pointEntryTitle}>
                  📍 Pile #{selectedPileIndex + 1} — {localGrid[selectedPileIndex]?.label ?? `#${selectedPileIndex}`}
                </Text>

                <Text style={styles.fieldLabel}>Latitude</Text>
                <TextInput
                  style={styles.input}
                  value={entryLat}
                  onChangeText={setEntryLat}
                  keyboardType="decimal-pad"
                  placeholder="13.082700"
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={styles.fieldLabel}>Longitude</Text>
                <TextInput
                  style={styles.input}
                  value={entryLon}
                  onChangeText={setEntryLon}
                  keyboardType="decimal-pad"
                  placeholder="80.270700"
                  placeholderTextColor={colors.textSecondary}
                />

                {/* Live distance validation */}
                {refPoints.length >= 1 && liveValidation && (
                  <View style={styles.validationCard}>
                    <Text style={[
                      styles.validationText,
                      liveValidation.status === 'valid' && styles.validText,
                      liveValidation.status === 'warning' && styles.warnText,
                      liveValidation.status === 'error' && styles.validationErrorText,
                    ]}>
                      Deviation: {liveValidation.deviationCm.toFixed(1)} cm
                      {liveValidation.status === 'valid' && ' ✓ Valid'}
                      {liveValidation.status === 'warning' && ' ⚠ Check coords'}
                      {liveValidation.status === 'error' && ' ✗ Invalid'}
                    </Text>
                  </View>
                )}

                <View style={styles.pointEntryButtons}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => {
                      setShowPointDialog(false);
                      setSelectedPileIndex(null);
                      setEntryLat('');
                      setEntryLon('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.btnText}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, (!entryLat || !entryLon) && styles.btnDisabled]}
                    onPress={handleSavePoint}
                    disabled={!entryLat || !entryLon}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.btnText}>Save Point</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.headerBlue,
  },
  headerClose: {
    padding: 8,
    marginRight: 8,
  },
  headerCloseText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 80,
  },
  stepContent: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Sections
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

  // Table type selector
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: 'rgba(0, 178, 111, 0.15)',
    borderColor: colors.greenBtn,
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  typeBtnTextActive: {
    color: colors.text,
  },

  // Inputs
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  inputGroup: {
    flex: 1,
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: 8,
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
  inputError: {
    borderColor: colors.redBtn,
  },
  fieldError: {
    fontSize: 10,
    color: colors.redBtn,
    marginTop: 2,
  },

  // Mock Mode
  mockModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    padding: 14,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mockModeLeft: {
    flex: 1,
    marginRight: 12,
  },
  mockModeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  mockModeSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  directionSelector: {
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  directionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  directionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  directionBtnActive: {
    borderColor: colors.greenBtn,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  directionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  directionDeg: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  mockOriginCard: {
    backgroundColor: colors.inputBg,
    borderRadius: 6,
    padding: 10,
  },
  mockOriginText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  mockOriginWarning: {
    fontSize: 11,
    color: '#f59e0b',
  },

  // Preview Card
  previewCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: 8,
  },
  previewGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  previewLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  previewValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },

  // Canvas
  canvasContainer: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  canvas: {
    position: 'relative',
  },
  pileNumber: {
    fontSize: 6,
    color: '#fff',
    fontWeight: '700',
  },

  subtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
  },

  // Reference points
  refSection: {
    marginBottom: 12,
  },
  refCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  refCoords: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  refDeviation: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  clearText: {
    fontSize: 11,
    color: colors.redBtn,
    marginTop: 4,
  },

  // Distances
  distSection: {
    marginBottom: 12,
  },
  distCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 4,
  },
  distTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  distValue: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  distValid: { color: colors.greenBtn },
  distWarning: { color: '#f59e0b' },
  distError: { color: colors.redBtn },

  // Actions
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
  nextBtn: {
    flex: 1,
    backgroundColor: colors.greenBtn,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  nextText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  generateBtn: {
    flex: 2,
    backgroundColor: colors.greenBtn,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  generateBtnDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
  generateText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.greenBtn,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  skipBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  skipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Point Entry Overlay (inline, no nested Modal)
  pointEntryOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  pointEntryCard: {
    width: '85%',
    backgroundColor: colors.panelBg,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pointEntryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  pointEntryButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: colors.inputBg,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: colors.greenBtn,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
  btnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Validation
  validationCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  validationText: {
    fontSize: 14,
    fontWeight: '700',
  },
  validText: { color: colors.greenBtn },
  warnText: { color: '#f59e0b' },
  validationErrorText: { color: colors.redBtn },
});