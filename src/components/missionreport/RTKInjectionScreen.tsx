import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { RtkProfileEditor } from "../rtk/RtkProfileEditor";
import { RtkProfileList } from "../rtk/RtkProfileList";
import { RtkStatusStrip } from "../rtk/RtkStatusStrip";
import { useRtkControl } from "../../hooks/useRtkControl";
import {
  importSelectedLocalRtkProfiles,
  listLocalRtkProfilesForMigration,
  type RtkLocalProfileSummary,
} from "../../services/rtkLocalMigration";
import type { RoverServices } from "../../hooks/useRoverTelemetry";
import { colors } from "../../theme/colors";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Retained so MissionReportScreen / Settings do not need a prop change. */
  services?: RoverServices;
  isConnected: boolean;
}

export const RTKInjectionScreen: React.FC<Props> = ({
  visible,
  onClose,
  isConnected,
}) => {
  const control = useRtkControl({
    visible,
    connected: isConnected,
  });
  const [creating, setCreating] = useState(false);
  const [localProfiles, setLocalProfiles] =
    useState<RtkLocalProfileSummary[]>([]);
  const [importing, setImporting] = useState(false);

  const loadLocal = useCallback(async () => {
    try {
      const locals = await listLocalRtkProfilesForMigration();
      setLocalProfiles(Array.isArray(locals) ? locals : []);
    } catch {
      setLocalProfiles([]);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setCreating(false);
      return;
    }
    void loadLocal();
  }, [loadLocal, visible]);

  const handleCreate = () => {
    setCreating(true);
    control.selectProfile(null);
  };

  const handleSelect = (id: number) => {
    setCreating(false);
    control.selectProfile(id);
  };

  const handleImport = () => {
    if (localProfiles.length === 0 || importing) {
      return;
    }

    Alert.alert(
      "Import local RTK profiles?",
      "Local tablet profiles will be created on the rover with TLS REQUIRED. They will not start RTK automatically.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import",
          onPress: () => {
            void (async () => {
              setImporting(true);
              try {
                const result = await importSelectedLocalRtkProfiles({
                  localIds: localProfiles.map((profile) => profile.id),
                  tlsMode: "REQUIRED",
                  confirmDisabledTls: false,
                });
                await control.refresh();
                await loadLocal();
                const imported = result.imported.length;
                const failed = result.failed.length;
                Alert.alert(
                  failed > 0 ? "Partial import" : "Import complete",
                  `${imported} imported. ${failed} left on the tablet for retry.`,
                );
              } catch (error) {
                Alert.alert(
                  "Import failed",
                  error instanceof Error ? error.message : "Unable to import local profiles.",
                );
              } finally {
                setImporting(false);
              }
            })();
          },
        },
      ],
    );
  };

  const editorMode = creating
    ? "create"
    : control.selectedProfile
      ? "edit"
      : "idle";

  const controlsBusy = control.mutationBusy || importing;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      supportedOrientations={["landscape", "landscape-left", "landscape-right"]}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
            <Text style={styles.title}>Configure RTK Injection</Text>
            <View style={styles.headerSpacer} />
          </View>

          <RtkStatusStrip view={control.view} />

          {localProfiles.length > 0 ? (
            <View style={styles.migration}>
              <View style={styles.migrationCopy}>
                <Text style={styles.migrationTitle}>
                  Local RTK profiles found — Import to rover
                </Text>
                <Text style={styles.migrationBody}>
                  {localProfiles.length} tablet profile
                  {localProfiles.length === 1 ? "" : "s"} will not run RTK until
                  imported. TLS defaults to REQUIRED.
                </Text>
              </View>
              <Pressable
                onPress={handleImport}
                disabled={controlsBusy || !isConnected}
                style={[
                  styles.importButton,
                  (controlsBusy || !isConnected) && styles.disabled,
                ]}
              >
                {importing ? (
                  <ActivityIndicator color="#041018" />
                ) : (
                  <Text style={styles.importText}>Import</Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {control.initialLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>Loading backend RTK state…</Text>
            </View>
          ) : (
            <View style={styles.body}>
              <RtkProfileList
                profiles={control.profiles}
                selectedProfileId={creating ? null : control.selectedProfileId}
                activeProfileId={control.view.activeProfileId}
                disabled={controlsBusy || !isConnected}
                onSelect={handleSelect}
                onCreate={handleCreate}
              />
              <RtkProfileEditor
                mode={editorMode}
                profile={creating ? null : control.selectedProfile}
                activeProfileId={control.view.activeProfileId}
                desiredState={control.view.desiredState}
                busy={controlsBusy}
                disabled={!isConnected || importing}
                disabledReason={
                  importing ? "Legacy RTK profile import in progress" : control.disabledReason
                }
                canStart={control.canStart}
                canStop={control.canStop}
                canDelete={control.canDelete}
                onCreate={async (dto) => {
                  const result = await control.createProfile(dto);
                  if (result.ok) {
                    setCreating(false);
                    control.selectProfile(result.value.id);
                  }
                }}
                onUpdate={async (id, dto) => {
                  await control.updateProfile(id, dto);
                }}
                onDelete={async (id) => {
                  await control.removeProfile(id);
                }}
                onActivate={async (id) => {
                  await control.activateProfile(id);
                }}
                onClearActive={async () => {
                  await control.clearActive();
                }}
                onStart={async () => {
                  await control.start();
                }}
                onStop={async () => {
                  await control.stop();
                }}
              />
            </View>
          )}

          {control.error ? (
            <Text style={styles.error}>{control.error.message}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  container: {
    width: "96%",
    height: "94%",
    backgroundColor: colors.primary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.secondary,
  },
  close: {
    minHeight: 48,
    minWidth: 72,
    justifyContent: "center",
  },
  closeText: {
    color: colors.cyan,
    fontWeight: "800",
  },
  title: {
    flex: 1,
    textAlign: "center",
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  headerSpacer: {
    width: 72,
  },
  migration: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1f2937",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  migrationCopy: {
    flex: 1,
  },
  migrationTitle: {
    color: colors.warning,
    fontWeight: "800",
  },
  migrationBody: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  importButton: {
    minHeight: 48,
    minWidth: 96,
    borderRadius: 10,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  importText: {
    color: "#041018",
    fontWeight: "800",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: colors.textSecondary,
  },
  body: {
    flex: 1,
    flexDirection: "row",
  },
  error: {
    color: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disabled: {
    opacity: 0.5,
  },
});
