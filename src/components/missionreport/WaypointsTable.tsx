import React, { useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { LegendList, type LegendListRenderItemProps } from "@legendapp/list";
import { colors } from "../../theme/colors";
import { PATH_PLAN_GLASS } from "../../constants/pathPlanGlass";
import type { Waypoint } from "./types";
import { MissionTableToolbarActions } from "./MissionTableToolbarActions";
import type { WaypointUiStatus } from "../../types/missionWaypointStatus";
import type { RawGnssSurveySnapshot } from "../../services/missionApi";
import { getStatusPresentation } from "../../utils/missionStatusPresentation";

// DYX RAW GNSS WAYPOINT DISPLAY

// ── Pure helper functions (extracted for reuse in memoized rows) ──────────────

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return "—";
  try {
    const timestampLocal = timestamp.replace("Z", "");
    const date = new Date(timestampLocal);
    if (isNaN(date.getTime())) return "—";
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  } catch {
    return "—";
  }
}

function getWaypointStatusDisplay(wpStatus: any): {
  statusDisplay: string;
  statusColor: string;
} {
  const s = wpStatus?.status as WaypointUiStatus | undefined;
  const p = getStatusPresentation(s);
  return {
    statusDisplay: p.label,
    statusColor: p.color ?? "#94A3B8",
  };
}

function getRemarkText(wpStatus: any): string {
  const remark =
    typeof wpStatus?.remark === "string" ? wpStatus.remark.trim() : "";

  return remark || "—";
}

function finiteSurveyNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function formatSurveyCoordinate(value: unknown): string {
  const number = finiteSurveyNumber(value);
  return number === null ? "—" : number.toFixed(7);
}

function formatSurveyError(
  survey: RawGnssSurveySnapshot | null | undefined,
): string {
  if (!survey) return "—";

  if (survey.available !== true) {
    return "UNAVAILABLE";
  }

  const radialMm = finiteSurveyNumber(
    survey.radial_error_mm,
  );

  return radialMm === null
    ? "—"
    : `${radialMm.toFixed(1)} mm`;
}

// ── Memoized row component (recycled by LegendList) ───────────────────────────

interface RowProps {
  wp: Waypoint;
  index: number;
  wpStatus: any;
  isCurrentWaypoint: boolean;
  embedded?: boolean;
}

const WaypointRow = React.memo(
  ({ wp, index, wpStatus, isCurrentWaypoint, embedded = false }: RowProps) => {
    const { statusDisplay, statusColor } = getWaypointStatusDisplay(wpStatus);
    const isSkipped = wpStatus?.status === "skipped";

    return (
      <View
        style={[
          styles.tableRow,
          embedded && styles.tableRowEmbedded,
          index % 2 === 0 && styles.tableRowAlt,
          isCurrentWaypoint && styles.currentWaypointRow,
          isSkipped && styles.skippedRow,
        ]}
      >
        <Text
          style={[
            styles.cell,
            styles.colSN,
            styles.cellYellow,
            isCurrentWaypoint && styles.currentWaypointText,
            isSkipped && styles.skippedText,
          ]}
        >
          {index + 1}
        </Text>
        <Text
          style={[
            styles.cell,
            styles.colBlock,
            styles.cellYellow,
            isCurrentWaypoint && styles.currentWaypointText,
            isSkipped && styles.skippedText,
          ]}
        >
          {wp.block}
        </Text>
        <Text
          style={[
            styles.cell,
            styles.colRow,
            isCurrentWaypoint && styles.currentWaypointText,
            isSkipped && styles.skippedText,
          ]}
        >
          {wp.row}
        </Text>
        <Text
          style={[
            styles.cell,
            styles.colPile,
            isCurrentWaypoint && styles.currentWaypointText,
            isSkipped && styles.skippedText,
          ]}
        >
          {wp.pile}
        </Text>
        <Text
          style={[
            styles.cell,
            styles.colLat,
            isCurrentWaypoint && styles.currentWaypointText,
            isSkipped && styles.skippedText,
          ]}
        >
          {wp.lat.toFixed(7)}
        </Text>
        <Text
          style={[
            styles.cell,
            styles.colLon,
            isCurrentWaypoint && styles.currentWaypointText,
            isSkipped && styles.skippedText,
          ]}
        >
          {wp.lon.toFixed(7)}
        </Text>

        {/* Frozen master-antenna RAW GNSS stop snapshot. DISPLAY ONLY. */}
        <View style={styles.colSurveyStop}>
          <Text
            numberOfLines={1}
            style={[
              styles.cell,
              styles.surveyCoordinateText,
              isCurrentWaypoint && styles.currentWaypointText,
              isSkipped && styles.skippedText,
            ]}
          >
            {formatSurveyCoordinate(
              wpStatus?.survey?.stopped_latitude_deg,
            )}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.cell,
              styles.surveyCoordinateText,
              isCurrentWaypoint && styles.currentWaypointText,
              isSkipped && styles.skippedText,
            ]}
          >
            {formatSurveyCoordinate(
              wpStatus?.survey?.stopped_longitude_deg,
            )}
          </Text>
        </View>

        <Text
          style={[
            styles.cell,
            styles.colSurveyError,
            wpStatus?.survey?.available === true &&
              styles.surveyErrorLive,
            isCurrentWaypoint && styles.currentWaypointText,
            isSkipped && styles.skippedText,
          ]}
        >
          {formatSurveyError(
            wpStatus?.survey,
          )}
        </Text>

        <View style={[styles.colStatus, isSkipped && styles.skippedStatusCell]}>
          <Text
            style={[
              styles.cell,
              { color: statusColor },
              isCurrentWaypoint && styles.currentWaypointText,
              isSkipped && styles.skippedText,
            ]}
          >
            {statusDisplay} {isCurrentWaypoint ? "◄" : ""}
          </Text>
          {isSkipped && (
            <View style={styles.skippedBadge}>
              <Text style={styles.skippedBadgeText}>SKIPPED</Text>
            </View>
          )}
        </View>
        <Text
          style={[
            styles.cell,
            styles.colTime,
            isCurrentWaypoint && styles.currentWaypointText,
            isSkipped && styles.skippedText,
          ]}
        >
          {formatTimestamp(wpStatus?.timestamp)}
        </Text>
        <View style={[styles.colRemark, styles.remarkCell]}>
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            style={[
              styles.cell,
              styles.remarkText,

              isCurrentWaypoint && styles.currentWaypointText,

              isSkipped && styles.skippedText,
            ]}
          >
            {getRemarkText(wpStatus)}
          </Text>
        </View>
      </View>
    );
  },
);

// ── Main table component ─────────────────────────────────────────────────────

interface Props {
  waypoints: Waypoint[];
  onExport?: () => void;
  onExportComplete?: () => void;
  onClear?: () => void;
  statusMap: Record<
    number,
    {
      reached?: boolean;
      marked?: boolean;
      status?: WaypointUiStatus;
      timestamp?: string;
      pile?: string | number;
      rowNo?: string | number;
      remark?: string;
      hrms?: number;
      vrms?: number;
      lat_achieved?: number;
      lon_achieved?: number;
      accuracy_level?: string;
      position_error_cm?: number;

      // Frozen CSV-vs-RAW-GNSS waypoint-table snapshot.
      survey?: RawGnssSurveySnapshot | null;
    }
  >;
  missionMode: string | null;
  currentIndex?: number | null;
  pinnedCount?: number;
  onReorder?: (fromIndex: number, direction: "up" | "down") => void;
  /** Floating overlay mode — hides duplicate outer chrome; MissionTableHeader owns the title row. */
  embedded?: boolean;
}

const ROW_HEIGHT = 64;

export const WaypointsTable = React.memo<Props>(
  ({
    waypoints,
    onExport,
    onExportComplete,
    onClear,
    statusMap,
    missionMode,
    currentIndex,
    embedded = false,
  }) => {
    const currentWaypointNumber =
      currentIndex != null ? currentIndex + 1 : null;

    // Force LegendList to re-render rows when status or active waypoint changes.
    // Without extraData, recycled containers keep stale status values because
    // renderItem closure changes alone don't trigger row re-computation.
    const listExtraData = React.useMemo(
      () => ({ statusMap, currentWaypointNumber }),
      [statusMap, currentWaypointNumber],
    );

    const renderItem = useCallback(
      (props: LegendListRenderItemProps<Waypoint>) => (
        <WaypointRow
          wp={props.item}
          index={props.index}
          wpStatus={statusMap[props.item.sn]}
          isCurrentWaypoint={
            currentWaypointNumber !== null &&
            props.item.sn === currentWaypointNumber
          }
          embedded={embedded}
        />
      ),
      [statusMap, currentWaypointNumber, embedded],
    );

    const keyExtractor = useCallback((item: Waypoint) => `wp-${item.sn}`, []);

    return (
      <View style={[styles.container, embedded && styles.containerEmbedded]}>
        <View style={styles.cardPadding}>
          {!embedded && (
            <View style={styles.headerRow}>
              <Text style={styles.title}>MISSION MARKING POINTS</Text>
              <MissionTableToolbarActions
                onClear={onClear}
                exportProps={{
                  waypoints,
                  statusMap,
                  missionMode,
                  onExport: onExport ?? (() => {}),
                  onExportComplete,
                }}
              />
            </View>
          )}

          {/* Table */}
          <View style={styles.tableWrapper}>
            {/* Fixed Table Header */}
            <View
              style={[
                styles.tableHeader,
                embedded && styles.tableHeaderEmbedded,
              ]}
            >
              <Text
                style={[
                  styles.headerCell,
                  styles.colSN,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                S/N
              </Text>
              <Text
                style={[
                  styles.headerCell,
                  styles.colBlock,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                BLOCK
              </Text>
              <Text
                style={[
                  styles.headerCell,
                  styles.colRow,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                ROW
              </Text>
              <Text
                style={[
                  styles.headerCell,
                  styles.colPile,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                PILE
              </Text>
              <Text
                style={[
                  styles.headerCell,
                  styles.colLat,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                LATITUDE
              </Text>
              <Text
                style={[
                  styles.headerCell,
                  styles.colLon,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                LONGITUDE
              </Text>
              <Text
                style={[
                  styles.headerCell,
                  styles.colSurveyStop,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                RAW GNSS STOP
              </Text>
              <Text
                style={[
                  styles.headerCell,
                  styles.colSurveyError,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                ERROR
              </Text>
              <Text
                style={[
                  styles.headerCell,
                  styles.colStatus,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                STATUS
              </Text>
              <Text
                style={[
                  styles.headerCell,
                  styles.colTime,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                TIMESTAMP
              </Text>
              <Text
                style={[
                  styles.headerCell,
                  styles.colRemark,
                  embedded && styles.headerCellEmbedded,
                ]}
              >
                REMARK
              </Text>
            </View>

            {/* Virtualized table body — only visible rows are mounted */}
            <LegendList
              data={waypoints}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              recycleItems={true}
              estimatedItemSize={ROW_HEIGHT}
              getFixedItemSize={() => ROW_HEIGHT}
              style={[
                styles.scrollableTableBody,
                embedded && styles.scrollableTableBodyEmbedded,
              ]}
              showsVerticalScrollIndicator
              extraData={listExtraData}
            />
          </View>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#002244",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  containerEmbedded: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardPadding: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(34, 211, 238, 0.3)",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent,
    letterSpacing: 1,
    textAlign: "center",
  },
  tableWrapper: {
    flex: 1,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#051a30ff",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  tableHeaderEmbedded: {
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  headerCell: {
    color: "#07daf6ff",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "left",
  },
  headerCellEmbedded: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  scrollableTableBody: {
    flex: 1,
    maxHeight: 200,
  },
  scrollableTableBodyEmbedded: {
    maxHeight: undefined,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(34, 211, 238, 0.3)",
    minHeight: ROW_HEIGHT,
    alignItems: "center",
  },
  tableRowEmbedded: {
    borderTopColor: "rgba(255, 255, 255, 0.03)",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tableRowAlt: {
    backgroundColor: "transparent",
  },
  cell: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "left",
  },
  cellYellow: {
    color: colors.textSecondary,
  },
  currentWaypointRow: {
    backgroundColor: "rgba(103, 232, 249, 0.08)",
    borderLeftWidth: 3,
    borderLeftColor: PATH_PLAN_GLASS.cyan,
  },
  currentWaypointText: {
    color: PATH_PLAN_GLASS.cyan,
    fontWeight: "600",
  },
  skippedRow: {
    opacity: 0.55,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  skippedText: {
    textDecorationLine: "line-through",
    color: "#94A3B8",
  },
  skippedBadge: {
    marginLeft: 8,
    backgroundColor: "#334155",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "center",
  },
  skippedBadgeText: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "700",
  },
  skippedStatusCell: {
    flexDirection: "row",
    alignItems: "center",
  },
  colSN: { flex: 0.55, textAlign: "center" },
  colBlock: { flex: 0.85 },
  colRow: { flex: 0.75 },
  colPile: { flex: 0.75 },
  colLat: { flex: 1.25 },
  colLon: { flex: 1.25 },

  // Existing LAT/LON are CSV target. This is the frozen raw-GNSS stop.
  colSurveyStop: {
    flex: 1.45,
    justifyContent: "center",
  },
  surveyCoordinateText: {
    fontSize: 10,
    lineHeight: 14,
  },

  colSurveyError: {
    flex: 0.9,
    textAlign: "center",
  },
  surveyErrorLive: {
    color: PATH_PLAN_GLASS.cyan,
    fontWeight: "700",
  },

  colStatus: { flex: 1.05 },
  colTime: { flex: 1.05 },
  colRemark: { flex: 2.1 },
  remarkCell: {
    flexDirection: "column",
    justifyContent: "center",
  },
  remarkText: {
    fontSize: 10,
    lineHeight: 16,
  },
});
