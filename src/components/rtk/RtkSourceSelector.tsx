import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RtkCorrectionSourceName } from "../../types/rtk";
import { colors } from "../../theme/colors";

interface Props {
  /** Which settings panel is shown. Viewing never changes the backend. */
  viewing: RtkCorrectionSourceName;
  /** Source the backend has saved (starts at boot); null while unknown. */
  savedSource: RtkCorrectionSourceName | null;
  disabled?: boolean;
  onView: (source: RtkCorrectionSourceName) => void;
}

const OPTIONS: { value: RtkCorrectionSourceName; label: string; hint: string }[] = [
  { value: "NTRIP", label: "NTRIP", hint: "Caster profile / mountpoint" },
  { value: "LORA", label: "LoRa", hint: "Radio on a rover serial port" },
];

export const RtkSourceSelector: React.FC<Props> = ({
  viewing,
  savedSource,
  disabled = false,
  onView,
}) => (
  <View style={styles.wrap}>
    <Text style={styles.caption}>Correction source</Text>
    <View style={styles.row}>
      {OPTIONS.map((option) => {
        const selected = option.value === viewing;
        const saved = option.value === savedSource;
        return (
          <Pressable
            key={option.value}
            onPress={() => onView(option.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            style={[
              styles.option,
              selected && styles.optionSelected,
              disabled && styles.disabled,
            ]}
          >
            <View style={styles.optionHead}>
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {option.label}
              </Text>
              {saved ? (
                <View style={styles.activeTag}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>IN USE</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.hint}>{option.hint}</Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  caption: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  option: {
    flex: 1,
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: "#12264a",
  },
  optionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: "800",
  },
  labelSelected: {
    color: colors.text,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  activeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  activeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.45,
  },
});
