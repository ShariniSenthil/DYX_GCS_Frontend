import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { RtkControlViewModel } from "../../adapters/rtkControlAdapter";
import { colors } from "../../theme/colors";

interface Props {
  view: RtkControlViewModel;
}

function toneColor(tone: RtkControlViewModel["tone"]): string {
  switch (tone) {
    case "healthy":
      return colors.success;
    case "transitional":
    case "degraded":
      return colors.warning;
    case "terminal":
      return colors.danger;
    default:
      return colors.textSecondary;
  }
}

function formatAge(age: number | null): string {
  if (age == null || !Number.isFinite(age)) {
    return "—";
  }
  return `${age.toFixed(1)} s`;
}

function asText(value: unknown): string {
  if (value == null) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "—";
}

export const RtkStatusStrip: React.FC<Props> = ({ view }) => {
  const color = toneColor(view.tone);

  return (
    <View style={styles.wrap}>
      <View style={[styles.headline, { borderColor: color }]}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.headlineText, { color }]}>{asText(view.headlineLabel)}</Text>
        <Text style={styles.desired}>
          Desired {asText(view.desiredState)} · Manager {asText(view.managerState)}
        </Text>
      </View>

      <View style={styles.grid}>
        <Metric label="Corrections" value={asText(view.correctionState)} />
        <Metric label="Correction age" value={formatAge(view.correctionAgeSec)} />
        <Metric
          label="Published frames"
          value={view.publishedFrames == null ? "—" : String(view.publishedFrames)}
        />
        <Metric
          label="Socket bytes"
          value={
            view.socketBytesReceived == null
              ? "—"
              : String(view.socketBytesReceived)
          }
        />
        <Metric
          label="GNSS fix"
          value={
            typeof view.gnssFixName === "string"
              ? `${view.gnssFixName.replace(/_/g, " ")} (${view.gnssFixType ?? "—"})`
              : "—"
          }
        />
        <Metric
          label="RTK solution"
          value={view.rtkFixed ? "RTK Fixed" : view.rtkFloat ? "RTK Float" : "No RTK"}
        />
        {view.ggaEnabled ? (
          <Metric label="GGA" value={asText(view.ggaState)} />
        ) : null}
      </View>
    </View>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  headline: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.primary,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  headlineText: {
    fontSize: 16,
    fontWeight: "800",
  },
  desired: {
    marginLeft: "auto",
    color: colors.textSecondary,
    fontSize: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metric: {
    width: "33.33%",
    paddingVertical: 6,
    paddingRight: 8,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
});
