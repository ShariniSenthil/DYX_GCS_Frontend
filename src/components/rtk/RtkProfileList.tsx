import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { RtkProfile } from "../../types/rtk";
import { colors } from "../../theme/colors";

interface Props {
  profiles: RtkProfile[];
  selectedProfileId: number | null;
  activeProfileId: number | null;
  disabled?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
}

export const RtkProfileList: React.FC<Props> = ({
  profiles,
  selectedProfileId,
  activeProfileId,
  disabled = false,
  onSelect,
  onCreate,
}) => {
  const list = Array.isArray(profiles) ? profiles : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Backend profiles</Text>
        <Pressable
          onPress={onCreate}
          disabled={disabled}
          hitSlop={8}
          style={({ pressed }) => [
            styles.createButton,
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.createText}>Create Profile</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No backend RTK profiles</Text>
            <Text style={styles.emptyBody}>
              Create a profile on the rover. Local tablet profiles are not
              runtime authority.
            </Text>
          </View>
        ) : (
          list.map((profile) => {
            const selected = profile?.id === selectedProfileId;
            const active = profile?.id === activeProfileId;
            return (
              <Pressable
                key={profile?.id ?? Math.random()}
                onPress={() => profile?.id != null && onSelect(profile.id)}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.row,
                  selected && styles.rowSelected,
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}
              >
                <Text style={styles.name}>{profile?.name ?? "Unnamed profile"}</Text>
                <Text style={styles.meta}>
                  {profile?.caster_host ?? "—"}:{profile?.caster_port ?? 2101}/{profile?.mountpoint ?? "—"}
                </Text>
                <View style={styles.badges}>
                  {active ? <Badge label="Active" tone="accent" /> : null}
                  <Badge
                    label={profile?.enabled ? "Enabled" : "Disabled"}
                    tone={profile?.enabled ? "success" : "muted"}
                  />
                  <Badge
                    label={`TLS ${profile?.tls_mode ?? "REQUIRED"}`}
                    tone={profile?.tls_mode === "REQUIRED" ? "success" : profile?.tls_mode === "DISABLED" ? "warning" : "muted"}
                  />
                  <Badge label={`rev ${profile?.revision ?? 1}`} tone="muted" />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const Badge: React.FC<{
  label: string;
  tone: "accent" | "success" | "warning" | "muted";
}> = ({ label, tone }) => (
  <View style={[styles.badge, badgeTone[tone]]}>
    <Text style={styles.badgeText}>{label}</Text>
  </View>
);

const badgeTone = StyleSheet.create({
  accent: { backgroundColor: colors.cyan },
  success: { backgroundColor: colors.success },
  warning: { backgroundColor: colors.warning },
  muted: { backgroundColor: colors.textMuted },
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 280,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  createButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  createText: {
    color: "#fff",
    fontWeight: "800",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 24,
  },
  empty: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primary,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primary,
    padding: 12,
    gap: 4,
  },
  rowSelected: {
    borderColor: colors.cyan,
    backgroundColor: "#0b2533",
  },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: "#041018",
    fontSize: 10,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.85,
  },
});
