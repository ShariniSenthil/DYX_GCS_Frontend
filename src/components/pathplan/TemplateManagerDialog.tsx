import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { SolarTemplate, SolarTableParams } from '../../utils/solarTableGenerator';
import { TemplateStorage } from '../../services/TemplateStorage';
import { SolarTableDialog } from './SolarTableDialog';

// ─── Props ──────────────────────────────────────────────────

interface TemplateManagerDialogProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (coords: { latitude: number; longitude: number }[]) => void;
  defaultCenter?: { lat: number; lng: number };
}

// ─── Component ───────────────────────────────────────────────

export const TemplateManagerDialog: React.FC<TemplateManagerDialogProps> = ({
  visible,
  onClose,
  onGenerate,
  defaultCenter,
}) => {
  const [templates, setTemplates] = useState<SolarTemplate[]>([]);
  const [showSolarDialog, setShowSolarDialog] = useState(false);
  const [preloadedParams, setPreloadedParams] = useState<SolarTableParams | null>(null);

  // Load templates on open
  useEffect(() => {
    if (visible) {
      loadTemplates();
    }
  }, [visible]);

  const loadTemplates = useCallback(async () => {
    const loaded = await TemplateStorage.loadAllTemplates();
    setTemplates(loaded);
  }, []);

  const handleDelete = useCallback((template: SolarTemplate) => {
    Alert.alert(
      'Delete Template',
      `Delete "${template.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await TemplateStorage.deleteTemplate(template.id);
            loadTemplates();
          },
        },
      ],
    );
  }, [loadTemplates]);

  const handleLoad = useCallback((template: SolarTemplate) => {
    setPreloadedParams({ ...template.params });
    setShowSolarDialog(true);
  }, []);

  const handleSolarDialogClose = useCallback(() => {
    setShowSolarDialog(false);
    setPreloadedParams(null);
  }, []);

  const handleSolarGenerate = useCallback((coords: { latitude: number; longitude: number }[]) => {
    onGenerate(coords);
    setShowSolarDialog(false);
    setPreloadedParams(null);
    onClose();
  }, [onGenerate, onClose]);

  const formatDate = (isoStr: string): string => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return isoStr;
    }
  };

  const formatNumber = (n: number): string => n.toLocaleString();

  const renderItem = ({ item }: { item: SolarTemplate }) => (
    <View style={styles.templateCard}>
      <View style={styles.templateInfo}>
        <Text style={styles.templateName}>🌞 {item.name}</Text>
        <Text style={styles.templateDetail}>
          {item.params.tableType} piles | {item.params.tablesPerRow}×{item.params.rowCount} | {formatNumber(item.totalPiles)} total piles
        </Text>
        <Text style={styles.templateDate}>
          Created: {formatDate(item.createdAt)}
        </Text>
      </View>
      <View style={styles.templateActions}>
        <TouchableOpacity
          style={styles.loadBtn}
          onPress={() => handleLoad(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.loadText}>Load</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyTitle}>No templates saved yet</Text>
      <Text style={styles.emptyHint}>Create one using the Solar Table tool</Text>
    </View>
  );

  return (
    <>
      <Modal visible={visible && !showSolarDialog} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={styles.header}>
              <Text style={styles.headerIcon}>📋</Text>
              <Text style={styles.title}>TEMPLATE MANAGER</Text>
            </View>

            <FlatList
              data={templates}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={renderEmpty}
              contentContainerStyle={templates.length === 0 ? styles.emptyList : undefined}
            />

            <View style={styles.actions}>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* When loading a template, open SolarTableDialog pre-filled */}
      <SolarTableDialog
        visible={showSolarDialog}
        onClose={handleSolarDialogClose}
        onGenerate={handleSolarGenerate}
        defaultCenter={defaultCenter}
        initialParams={preloadedParams ?? undefined}
        startAtStep={preloadedParams ? 2 : undefined}
      />
    </>
  );
};

// ─── Styles ──────────────────────────────────────────────────

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
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  headerIcon: {
    fontSize: 24,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1,
    flex: 1,
  },

  // Template cards
  templateCard: {
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  templateDetail: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  templateDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  templateActions: {
    flexDirection: 'row',
    gap: 8,
  },
  loadBtn: {
    backgroundColor: colors.greenBtn,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  loadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: colors.redBtn,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Empty state
  emptyList: {
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textMuted,
  },

  // Actions
  actions: {
    marginTop: 12,
  },
  closeBtn: {
    backgroundColor: colors.inputBg,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});