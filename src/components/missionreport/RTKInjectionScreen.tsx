import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { RtkLoraSettings } from "../rtk/RtkLoraSettings";
import { RtkProfileEditor } from "../rtk/RtkProfileEditor";
import { RtkProfileList } from "../rtk/RtkProfileList";
import { RtkSourceSelector } from "../rtk/RtkSourceSelector";
import { RtkStatusStrip } from "../rtk/RtkStatusStrip";
import { useRtkControl } from "../../hooks/useRtkControl";
import {
  importSelectedLocalRtkProfiles,
  listLocalRtkProfilesForMigration,
  type RtkLocalProfileSummary,
} from "../../services/rtkLocalMigration";
import type { RoverServices } from "../../hooks/useRoverTelemetry";
import type { RtkCorrectionSourceName } from "../../types/rtk";
import { colors } from "../../theme/colors";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Retained so MissionReportScreen / Settings do not need a prop change. */
  services?: RoverServices;
  isConnected: boolean;
  /**
   * When false, render as a full-screen overlay instead of a nested RN Modal.
   * Settings is already a Modal; stacking another crashes Android.
   */
  asModal?: boolean;
}

export const RTKInjectionScreen: React.FC<Props> = ({
  visible,
  onClose,
  isConnected,
  asModal = true,
}) => {
  const control = useRtkControl({
    visible,
    connected: isConnected,
  });
  const [creating, setCreating] = useState(false);
  const [localProfiles, setLocalProfiles] =
    useState<RtkLocalProfileSummary[]>([]);
  const [importing, setImporting] = useState(false);
  // Which settings panel is shown. Follows the saved backend source until the
  // operator picks a panel; viewing never changes the backend by itself.
  const [viewingSource, setViewingSource] =
    useState<RtkCorrectionSourceName>("NTRIP");
  const viewPickedRef = useRef(false);
  const savedSource = control.view.correctionSource;
  const { loadSerialPorts } = control;

  useEffect(() => {
    if (!visible) {
      viewPickedRef.current = false;
      return;
    }
    if (!viewPickedRef.current && savedSource) {
      setViewingSource(savedSource);
    }
  }, [savedSource, visible]);

  useEffect(() => {
    if (visible && isConnected && viewingSource === "LORA") {
      void loadSerialPorts();
    }
  }, [isConnected, loadSerialPorts, viewingSource, visible]);

  const handleViewSource = (source: RtkCorrectionSourceName) => {
    viewPickedRef.current = true;
    setViewingSource(source);
  };

  const handleUseNtrip = () => {
    const running = control.view.desiredState === "RUNNING";
    Alert.alert(
      "Use NTRIP for RTK corrections?",
      running
        ? "RTK is running on LoRa. It will restart on the active NTRIP profile now, and NTRIP will also start on every boot. Corrections pause for a few seconds."
        : "NTRIP becomes the saved correction source and is used whenever RTK starts, including after a reboot.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            void control.updateCorrectionSource({ source: "NTRIP" });
          },
        },
      ],
    );
  };

  const loadLocal = useCallback(async () => {
    try {
      const locals = await listLocalRtkProfilesForMigration();
      setLocalProfiles(Array.isArray(locals) ? locals : []);
    } catch (error) {
      console.warn("[RTKInjectionScreen] Failed to load local profiles:", error);
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

  const body = (
      <View style={[styles.overlay, !asModal && styles.embeddedOverlay]}>
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
            <>
            <RtkSourceSelector
              viewing={viewingSource}
              savedSource={savedSource}
              disabled={controlsBusy}
              onView={handleViewSource}
            />
            {viewingSource === "LORA" ? (
              <View style={styles.body}>
                <RtkLoraSettings
                  settings={control.view.sourceSettings}
                  savedSource={savedSource}
                  desiredState={control.view.desiredState}
                  ports={control.serialPorts}
                  portsLoading={control.serialPortsLoading}
                  portsError={control.serialPortsError}
                  suggestedOutputDevice={
                    control.activeProfile?.direct_inject
                      ? control.activeProfile.direct_serial_device ?? null
                      : null
                  }
                  busy={controlsBusy}
                  disabled={!isConnected}
                  disabledReason={
                    savedSource === "LORA" ? control.disabledReason : null
                  }
                  canStart={savedSource === "LORA" && control.canStart}
                  canStop={savedSource === "LORA" && control.canStop}
                  onRefreshPorts={loadSerialPorts}
                  onSave={(dto) => control.updateCorrectionSource(dto)}
                  onStart={() => control.start()}
                  onStop={() => control.stop()}
                />
              </View>
            ) : (
            <>
            {savedSource === "LORA" ? (
              <View style={styles.sourceBanner}>
                <Text style={styles.sourceBannerText}>
                  LoRa is the correction source in use. NTRIP profiles can be
                  edited here but are not used until you switch back.
                </Text>
                <Pressable
                  onPress={handleUseNtrip}
                  disabled={controlsBusy || !isConnected || control.view.activeProfileId == null}
                  style={[
                    styles.useNtripButton,
                    (controlsBusy || !isConnected || control.view.activeProfileId == null) &&
                      styles.disabled,
                  ]}
                >
                  <Text style={styles.useNtripText}>Use NTRIP</Text>
                </Pressable>
              </View>
            ) : null}
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
                // While LoRa is in use these buttons would drive LoRa, not the
                // profile on screen, so NTRIP Start/Stop are disabled.
                canStart={savedSource !== "LORA" && control.canStart}
                canStop={savedSource !== "LORA" && control.canStop}
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
            </>
            )}
            </>
          )}

          {control.error ? (
            <Text style={styles.error}>{control.error.message}</Text>
          ) : null}
        </View>
      </View>
  );

  if (!asModal) {
    if (!visible) {
      return null;
    }
    return body;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      supportedOrientations={["landscape", "landscape-left", "landscape-right"]}
    >
      {body}
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
  embeddedOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
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
  sourceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#1f2937",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sourceBannerText: {
    flex: 1,
    color: colors.warning,
    fontSize: 12,
    lineHeight: 18,
  },
  useNtripButton: {
    minHeight: 48,
    minWidth: 112,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  useNtripText: {
    color: "#fff",
    fontWeight: "800",
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
