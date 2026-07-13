/* OPEN QUESTION: src/theme/colors.ts stores panelBg as '#051d38ff' (with alpha channel)
   while the UI style guide references '#051d38' (no alpha). Values are visually identical
   but may differ in tools that parse hex colors strictly. Review before production. */

// ============================================================
// LocalizationScreen — DXF Localization Pipeline
// ============================================================
//
// Top-level screen component that orchestrates the full DXF
// localization workflow: import → assign control points →
// compute transform → view residuals.
//
// Requirements: 1.1, 1.2, 1.3, 8.1, 9.1, 10.1, 11.1, 12.1,
//               13.1, 14.1, 15.1, 17.1
// ============================================================

import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

import { ParsedPointSet, SolveResult } from '../../core/geometry/parsedPoint';
import { parseDxfToPointSet } from '../../core/parser/toParsedPointSet';
import { localizeDxfPointSet } from '../../core/georef/localizeDxfPointSet';
import { setControlPoint, clearControlPoint } from './coordinateSheet.helpers';
import { pickDxfFile } from '../../application/adapters/dxfFile';
import { Viewport } from './canvas.helpers';

import { DxfCanvas } from './DxfCanvas';
import { PointList } from './PointList';
import { CoordinateSheet } from './CoordinateSheet';
import { ComputeButton } from './ComputeButton';
import { ResidualReporter } from './ResidualReporter';

// ── Component ─────────────────────────────────────────────────

export function LocalizationScreen(): React.ReactElement {
  // ── State ──────────────────────────────────────────────────

  const [points, setPoints] = useState<ParsedPointSet>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ panX: 0, panY: 0, zoom: 1 });
  const [showTransformed, setShowTransformed] = useState<boolean>(false);
  const [solveResult, setSolveResult] = useState<SolveResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // ── Responsive layout ──────────────────────────────────────
  // App is landscape-first. On narrow screens (<600px), stack canvas above list.
  const { width: screenWidth } = useWindowDimensions();
  const isWideLayout = screenWidth >= 600;

  // ── Derived state ──────────────────────────────────────────

  const controlPointCount = points.filter((p) => p.isControlPoint).length;
  const enabled = controlPointCount >= 3;

  // ── DXF import ─────────────────────────────────────────────

  async function handleImport(): Promise<void> {
    let picked: { name: string; text: string } | null = null;
    try {
      picked = await pickDxfFile();
    } catch (err: unknown) {
      const name =
        err instanceof Error && err.message.includes('"')
          ? err.message.split('"')[1] ?? 'file'
          : 'file';
      setErrorMessage(`Failed to read "${name}". Please try again.`);
      return;
    }

    // User cancelled
    if (picked === null) return;

    const { name, text } = picked;
    const { points: parsed, warnings } = parseDxfToPointSet(text);

    if (warnings.some((w) => w.includes('No ENTITIES section'))) {
      setWarningMessage(
        `"${name}" has no ENTITIES section. The file may be empty or unsupported.`
      );
    } else {
      setWarningMessage(null);
    }

    setPoints(parsed);
    setSelectedId(null);
    setSolveResult(null);
    setShowTransformed(false);
    setErrorMessage(null);
  }

  // ── CoordinateSheet callbacks ──────────────────────────────

  function handleConfirm(lat: number, lon: number): void {
    if (selectedId === null) return;
    setPoints((prev) =>
      prev.map((p) => (p.id === selectedId ? setControlPoint(p, lat, lon) : p))
    );
  }

  function handleClear(): void {
    if (selectedId === null) return;
    setPoints((prev) =>
      prev.map((p) => (p.id === selectedId ? clearControlPoint(p) : p))
    );
  }

  function handleDismiss(): void {
    setSelectedId(null);
  }

  // ── Compute transform ──────────────────────────────────────

  function handleCompute(): void {
    const { outcome, transformed } = localizeDxfPointSet(points);

    if (outcome.ok) {
      setPoints(transformed);
      setSolveResult(outcome);
      setShowTransformed(true);
      setErrorMessage(null);
    } else {
      setErrorMessage(outcome.message ?? 'Transform failed');
    }
  }

  // ── Selected point (for CoordinateSheet) ──────────────────

  const selectedPoint = selectedId !== null
    ? (points.find((p) => p.id === selectedId) ?? null)
    : null;

  // ── Render ─────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header row */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.importBtn}
          onPress={handleImport}
          activeOpacity={0.8}
        >
          <View style={styles.importIconWrap}>
            <Ionicons name="folder-open-outline" size={18} color="#4ade80" />
          </View>
          <Text style={styles.importBtnText}>IMPORT DXF</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleRow}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="map-outline" size={16} color={colors.accent} />
          </View>
          <Text style={styles.headerTitle}>DXF LOCALIZATION</Text>
        </View>
      </View>

      {/* Error banner */}
      {errorMessage !== null && (
        <View style={[styles.banner, styles.errorBanner]}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={[styles.bannerText, { color: colors.danger }]}>
            {errorMessage}
          </Text>
        </View>
      )}

      {/* Warning banner */}
      {warningMessage !== null && (
        <View style={[styles.banner, styles.warningBanner]}>
          <Ionicons name="warning-outline" size={14} color={colors.warning} />
          <Text style={[styles.bannerText, { color: colors.warning }]}>
            {warningMessage}
          </Text>
        </View>
      )}

      {/* Main content: canvas + point list — row on wide screens, column on narrow */}
      <View style={[
        styles.mainContent,
        !isWideLayout && styles.mainContentNarrow,
      ]}>
        <View style={isWideLayout ? styles.canvasWrapRow : styles.canvasWrapCol}>
          <DxfCanvas
            points={points}
            selectedId={selectedId}
            viewport={viewport}
            showTransformed={showTransformed}
            onViewportChange={setViewport}
            onPointTap={setSelectedId}
            onBackgroundTap={() => setSelectedId(null)}
          />
        </View>
        <View style={isWideLayout ? styles.listWrapRow : styles.listWrapCol}>
          <PointList
            points={points}
            selectedId={selectedId}
            onRowTap={setSelectedId}
          />
        </View>
      </View>

      {/* Bottom row: compute button + residuals */}
      <View style={styles.bottomRow}>
        <ComputeButton
          controlPointCount={controlPointCount}
          enabled={enabled}
          onPress={handleCompute}
        />
        {solveResult !== null && (
          <ResidualReporter
            rmsMeters={solveResult.rmsMeters}
            residuals={solveResult.residuals}
          />
        )}
      </View>

      {/* CoordinateSheet modal — always rendered, opens when selectedId is non-null */}
      <CoordinateSheet
        point={selectedPoint}
        onConfirm={handleConfirm}
        onClear={handleClear}
        onDismiss={handleDismiss}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Safe area root — handles notch/status bar on all platforms
  container: {
    flex: 1,
    backgroundColor: colors.panelBg,
    padding: 16,
    gap: 12,
  },

  // Header row
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  // Import button — green upload style per style guide
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
    backgroundColor: 'rgba(74,222,128,0.08)',
  },
  importIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(74,222,128,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  importBtnText: {
    color: '#4ade80',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },

  // Header title area
  headerTitleRow: {
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

  // Error / warning banners
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  warningBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },

  // Main content area: canvas + list side by side (landscape)
  // or stacked (portrait / narrow screens)
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },

  // Narrow-screen override: stack vertically
  mainContentNarrow: {
    flexDirection: 'column',
  },

  // Canvas wrapper — flex: 1 in row layout (fill remaining width)
  canvasWrapRow: {
    flex: 1,
  },

  // Canvas wrapper — 60% height in column layout
  canvasWrapCol: {
    flex: 3,
  },

  // List wrapper — auto width in row layout (sizes to content)
  listWrapRow: {
    width: 220,
  },

  // List wrapper — 40% height in column layout
  listWrapCol: {
    flex: 2,
  },

  // Bottom row: compute button + residual reporter
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
});
