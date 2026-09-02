/**
 * MAVLink Parameter Browser Modal
 *
 * Full-screen modal for browsing and editing ArduRover parameters.
 * Organized by groups (NAVL1, ATC_STR, WP, etc.) with search functionality.
 *
 * Features:
 * - Group filter pills (horizontal scroll)
 * - Search by param name
 * - Inline edit with current vs default value comparison
 * - Per-param save with spinner feedback
 * - All changes tracked and applied individually
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useConnection } from '../../context/ConnectionContext';
import { RoverParam, ParamListResponse, ParamGroupsResponse } from '../../types/params';

interface ParamBrowserModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ParamBrowserModal: React.FC<ParamBrowserModalProps> = ({
  visible,
  onClose,
}) => {
  const { services, connectionState } = useConnection();

  // UI State
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // Param State
  const [params, setParams] = useState<RoverParam[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [editValues, setEditValues] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState<Map<string, boolean>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  // Load params and groups on mount
  useEffect(() => {
    if (!visible) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Load groups first
        const groupsResult = await services.getParamGroups();
        if (groupsResult.success) {
          setGroups(groupsResult.groups);
        }

        // Load all params
        const paramsResult = await services.getParams();
        if (paramsResult.success) {
          setParams(paramsResult.params);
        }
      } catch (err) {
        console.error('Failed to load params:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [visible, services]);

  // Filter params based on group and search
  const filteredParams = useCallback(() => {
    return params.filter((param) => {
      // Group filter
      if (selectedGroup && param.group !== selectedGroup) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          param.name.toLowerCase().includes(query) ||
          (param.description && param.description.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [params, selectedGroup, searchQuery]);

  // Handle param value change in edit field
  const handleEditChange = useCallback((paramName: string, value: string) => {
    setEditValues((prev) => {
      const next = new Map(prev);
      next.set(paramName, value);
      return next;
    });
    // Clear error when user starts editing
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(paramName);
      return next;
    });
  }, []);

  // Handle param save
  const handleSave = async (param: RoverParam) => {
    const editValue = editValues.get(param.name);
    if (editValue === undefined || editValue === String(param.value)) {
      return; // No change
    }

    const newValue = parseFloat(editValue);
    if (isNaN(newValue)) {
      setErrors((prev) => new Map(prev).set(param.name, 'Invalid number'));
      return;
    }

    setSaving((prev) => new Map(prev).set(param.name, true));
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(param.name);
      return next;
    });

    try {
      const result = await services.setParam(param.name, newValue);
      if (result.success) {
        // Update local param list with new value
        setParams((prev) =>
          prev.map((p) =>
            p.name === param.name ? { ...p, value: newValue } : p
          )
        );
        // Clear edit value
        setEditValues((prev) => {
          const next = new Map(prev);
          next.delete(param.name);
          return next;
        });
      } else {
        setErrors((prev) => new Map(prev).set(param.name, result.message || 'Failed to save'));
      }
    } catch (err) {
      setErrors((prev) => new Map(prev).set(param.name, 'Save failed'));
    } finally {
      setSaving((prev) => {
        const next = new Map(prev);
        next.delete(param.name);
        return next;
      });
    }
  };

  // Reset a param to default
  const handleReset = async (param: RoverParam) => {
    if (param.default_value === undefined) return;

    setSaving((prev) => new Map(prev).set(param.name, true));
    try {
      const result = await services.setParam(param.name, param.default_value);
      if (result.success) {
        setParams((prev) =>
          prev.map((p) =>
            p.name === param.name ? { ...p, value: param.default_value! } : p
          )
        );
      }
    } catch (err) {
      console.error('Reset failed:', err);
    } finally {
      setSaving((prev) => {
        const next = new Map(prev);
        next.delete(param.name);
        return next;
      });
    }
  };

  const isParamChanged = (param: RoverParam) => {
    const editValue = editValues.get(param.name);
    return editValue !== undefined && editValue !== String(param.value);
  };

  const displayedParams = filteredParams();
  const hasChanges = Array.from(editValues.values()).some(
    (val, idx) => val !== String(displayedParams[idx]?.value)
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="swap-horizontal-outline" size={24} color={colors.accent} />
            <Text style={styles.headerTitle}>MAVLink Parameters</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close-outline" size={28} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Connection Warning */}
        {connectionState !== 'connected' && (
          <View style={styles.connectionWarning}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
            <Text style={styles.connectionWarningText}>
              Connect to rover to read/write parameters
            </Text>
          </View>
        )}

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search parameters..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Group Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.groupsContainer}
        >
          <TouchableOpacity
            style={[
              styles.groupPill,
              selectedGroup === null && styles.groupPillActive,
            ]}
            onPress={() => setSelectedGroup(null)}
          >
            <Text
              style={[
                styles.groupPillText,
                selectedGroup === null && styles.groupPillTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
          {groups.map((group) => (
            <TouchableOpacity
              key={group}
              style={[
                styles.groupPill,
                selectedGroup === group && styles.groupPillActive,
              ]}
              onPress={() => setSelectedGroup(group)}
            >
              <Text
                style={[
                  styles.groupPillText,
                  selectedGroup === group && styles.groupPillTextActive,
                ]}
              >
                {group}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Param List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading parameters...</Text>
          </View>
        ) : (
          <ScrollView style={styles.paramList} showsVerticalScrollIndicator={false}>
            {displayedParams.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="filter-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyText}>No parameters found</Text>
              </View>
            ) : (
              displayedParams.map((param) => {
                const isSaving = saving.get(param.name);
                const error = errors.get(param.name);
                const changed = isParamChanged(param);
                const editValue = editValues.get(param.name);

                return (
                  <View key={param.name} style={styles.paramRow}>
                    {/* Param Info */}
                    <View style={styles.paramInfo}>
                      <View style={styles.paramRowTop}>
                        <Text style={styles.paramName}>{param.name}</Text>
                        {param.units && (
                          <Text style={styles.paramUnit}>{param.units}</Text>
                        )}
                      </View>
                      {param.description && (
                        <Text style={styles.paramDescription} numberOfLines={2}>
                          {param.description}
                        </Text>
                      )}
                      <View style={styles.paramRowBottom}>
                        <Text style={styles.paramCurrent}>
                          Current: {param.value.toFixed(2)}
                        </Text>
                        {param.default_value !== undefined && (
                          <Text style={styles.paramDefault}>
                            Default: {param.default_value.toFixed(2)}
                          </Text>
                        )}
                      </View>
                      {error && <Text style={styles.errorText}>{error}</Text>}
                    </View>

                    {/* Edit Controls */}
                    <View style={styles.editControls}>
                      <TextInput
                        style={[
                          styles.editInput,
                          changed && styles.editInputChanged,
                        ]}
                        value={editValue ?? String(param.value)}
                        onChangeText={(val) => handleEditChange(param.name, val)}
                        keyboardType="decimal-pad"
                        autoCapitalize="none"
                        autoCorrect={false}
                        selectTextOnFocus
                      />
                      <View style={styles.editButtons}>
                        {changed && (
                          <TouchableOpacity
                            style={[
                              styles.saveButton,
                              isSaving && styles.saveButtonDisabled,
                            ]}
                            onPress={() => handleSave(param)}
                            disabled={isSaving}
                          >
                            {isSaving ? (
                              <ActivityIndicator size="small" color={colors.text} />
                            ) : (
                              <Ionicons name="checkmark" size={18} color={colors.text} />
                            )}
                          </TouchableOpacity>
                        )}
                        {param.default_value !== undefined && (
                          <TouchableOpacity
                            style={styles.resetButton}
                            onPress={() => handleReset(param)}
                            disabled={isSaving}
                          >
                            <Ionicons
                              name="refresh-outline"
                              size={20}
                              color={colors.textSecondary}
                            />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/* Footer Stats */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {displayedParams.length} parameters
            {selectedGroup && ` in ${selectedGroup}`}
          </Text>
          {hasChanges && (
            <View style={styles.changesIndicator}>
              <Ionicons name="create-outline" size={14} color={colors.accent} />
              <Text style={styles.changesText}>Unsaved changes</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.cardBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },

  // Connection Warning
  connectionWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.danger + '10',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  connectionWarningText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: '500',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },

  // Group Pills
  groupsContainer: {
    maxHeight: 44,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  groupPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.panelBg,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  groupPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  groupPillText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  groupPillTextActive: {
    color: colors.text,
    fontWeight: '600',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: colors.textSecondary,
  },

  // Param List
  paramList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  paramRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '40',
    gap: 12,
  },
  paramInfo: {
    flex: 1,
    gap: 4,
  },
  paramRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paramName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  paramUnit: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  paramDescription: {
    fontSize: 12,
    color: colors.textMuted,
  },
  paramRowBottom: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  paramCurrent: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  paramDefault: {
    fontSize: 12,
    color: colors.textMuted,
  },
  errorText: {
    fontSize: 11,
    color: colors.danger,
    marginTop: 4,
  },

  // Edit Controls
  editControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    width: 90,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editInputChanged: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  saveButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  resetButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.panelBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  footerText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  changesIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changesText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
  },
});
