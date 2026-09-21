/**
 * Robot Settings Modal
 *
 * Full-screen modal for viewing & editing ArduRover parameters.
 * Organized into 4 categories — GPS, Serial, Motor Drive, WP Nav.
 *
 * Flow:
 * 1. User opens modal → sees 4 category cards
 * 2. Taps a category → loads current param values from rover via services.getParam()
 * 3. User edits values inline (TextInput with validation)
 * 4. Taps "Apply All" → writes changes via services.setParam() sequentially
 * 5. Shows progress + success/error per param
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useRover } from '../../context/RoverContext';
import {
  CATEGORIES,
  ConfigCategory,
  ParamDef,
} from '../../types/robotSettings';

interface RobotSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

// ─── ParamRow: single parameter row with current value + inline editing ───

interface ParamRowProps {
  param: ParamDef;
  currentValue: number | null;  // null = not loaded yet
  isLoading: boolean;
  editValue: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onChangeText: (text: string) => void;
  onEndEdit: () => void;
  applyStatus: 'idle' | 'applying' | 'success' | 'error';
}

const ParamRow: React.FC<ParamRowProps> = ({
  param,
  currentValue,
  isLoading,
  editValue,
  isEditing,
  onStartEdit,
  onChangeText,
  onEndEdit,
  applyStatus,
}) => {
  const hasChanged = currentValue !== null && editValue !== '' &&
    parseFloat(editValue) !== currentValue;
  const enumLabel = param.enumValues && currentValue !== null
    ? param.enumValues[currentValue]
    : null;

  return (
    <View style={styles.paramRow}>
      {/* Left: param name + description + current value */}
      <View style={styles.paramInfo}>
        <View style={styles.paramNameRow}>
          <Text style={styles.paramName}>{param.name}</Text>
          {param.rebootRequired && (
            <View style={styles.rebootBadge}>
              <Text style={styles.rebootBadgeText}>REBOOT</Text>
            </View>
          )}
        </View>
        <Text style={styles.paramDesc} numberOfLines={2}>{param.description}</Text>
        
        {/* Subtle Current Value Readout */}
        <View style={styles.currentValueRow}>
          <Text style={styles.currentValueLabel}>Current:</Text>
          {isLoading ? (
            <ActivityIndicator size="small" color="#64748B" style={{ marginLeft: 6 }} />
          ) : currentValue !== null ? (
            <Text style={styles.paramCurrentValue}>
              {param.paramType === 'INT' ? currentValue : currentValue.toFixed(2)}
              {enumLabel ? ` (${enumLabel})` : ''}
            </Text>
          ) : (
            <Text style={styles.paramNoValue}>—</Text>
          )}
        </View>
      </View>

      {/* Right: editable value */}
      <View style={styles.paramEditCol}>
        {isEditing ? (
          <TextInput
            style={[
              styles.paramInput,
              hasChanged && styles.paramInputChanged,
            ]}
            value={editValue}
            onChangeText={onChangeText}
            onBlur={onEndEdit}
            keyboardType="decimal-pad"
            selectTextOnFocus
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onEndEdit}
          />
        ) : (
          <TouchableOpacity
            style={[
              styles.paramValueBtn,
              hasChanged && styles.paramValueBtnChanged,
              applyStatus === 'success' && styles.paramValueBtnSuccess,
              applyStatus === 'error' && styles.paramValueBtnError,
            ]}
            onPress={onStartEdit}
            activeOpacity={0.7}
          >
            {applyStatus === 'applying' ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : applyStatus === 'success' ? (
              <Ionicons name="checkmark" size={16} color={colors.success} />
            ) : applyStatus === 'error' ? (
              <Ionicons name="close" size={16} color={colors.danger} />
            ) : (
              <Text style={[
                styles.paramEditValue,
                hasChanged && styles.paramEditValueChanged,
              ]}>
                {editValue || (param.paramType === 'INT'
                  ? String(param.defaultValue)
                  : param.defaultValue.toFixed(2))}
              </Text>
            )}
          </TouchableOpacity>
        )}
        {param.unit ? (
          <Text style={styles.paramUnit}>{param.unit}</Text>
        ) : null}
        {!isEditing && applyStatus === 'idle' && (
          <TouchableOpacity onPress={onStartEdit} style={styles.editIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="create-outline" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ─── CategoryPanel: shows all params for one category ───

interface CategoryPanelProps {
  category: ConfigCategory;
  onBack: () => void;
  services: any;
  isConnected: boolean;
}

const CategoryPanel: React.FC<CategoryPanelProps> = ({
  category,
  onBack,
  services,
  isConnected,
}) => {
  const categoryInfo = CATEGORIES[category];
  const params = categoryInfo.params;

  // State for each param
  const [currentValues, setCurrentValues] = useState<Record<string, number | null>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [loadingParams, setLoadingParams] = useState<Record<string, boolean>>({});
  const [editingParam, setEditingParam] = useState<string | null>(null);
  const [applyStatus, setApplyStatus] = useState<Record<string, 'idle' | 'applying' | 'success' | 'error'>>({});
  const [isApplying, setIsApplying] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load current values from rover on mount
  useEffect(() => {
    if (!isConnected) return;

    const loadParams = async () => {
      const loading: Record<string, boolean> = {};
      params.forEach(p => { loading[p.name] = true; });
      setLoadingParams(loading);

      for (const param of params) {
        try {
          const result = await services.getParam(param.name);
          if (!mountedRef.current) return;
          if (result.success && result.param) {
            setCurrentValues(prev => ({ ...prev, [param.name]: result.param.value }));
            // Initialize edit value with current rover value
            setEditValues(prev => ({
              ...prev,
              [param.name]: param.paramType === 'INT'
                ? String(Math.round(result.param.value))
                : String(result.param.value),
            }));
          } else {
            // Param not available — use default as edit value
            setEditValues(prev => ({
              ...prev,
              [param.name]: param.paramType === 'INT'
                ? String(param.defaultValue)
                : String(param.defaultValue),
            }));
          }
        } catch (err) {
          console.warn(`[RobotSettings] Failed to load ${param.name}:`, err);
          if (!mountedRef.current) return;
          setEditValues(prev => ({
            ...prev,
            [param.name]: param.paramType === 'INT'
              ? String(param.defaultValue)
              : String(param.defaultValue),
          }));
        } finally {
          if (mountedRef.current) {
            setLoadingParams(prev => ({ ...prev, [param.name]: false }));
          }
        }
      }
    };

    loadParams();
  }, [isConnected, category]);

  // Initialize edit values with defaults when not connected
  useEffect(() => {
    if (isConnected) return;
    const defaults: Record<string, string> = {};
    params.forEach(p => {
      defaults[p.name] = p.paramType === 'INT'
        ? String(p.defaultValue)
        : String(p.defaultValue);
    });
    setEditValues(defaults);
  }, [isConnected, category]);

  // Handle text change with validation
  const handleChangeText = useCallback((paramName: string, text: string) => {
    // Allow empty, minus sign, or valid decimal input
    if (text === '' || text === '-' || text === '.' || text === '-.') {
      setEditValues(prev => ({ ...prev, [paramName]: text }));
      return;
    }
    const num = parseFloat(text);
    if (!isNaN(num)) {
      setEditValues(prev => ({ ...prev, [paramName]: text }));
    }
  }, []);

  // End editing — validate and clamp
  const handleEndEdit = useCallback((paramName: string) => {
    const param = params.find(p => p.name === paramName);
    if (!param) return;

    setEditingParam(null);
    const text = editValues[paramName] || '';
    let num = parseFloat(text);
    if (isNaN(num)) {
      num = currentValues[paramName] ?? param.defaultValue;
    }
    // Clamp to min/max
    num = Math.max(param.min, Math.min(param.max, num));
    // Round for INT types
    if (param.paramType === 'INT') {
      num = Math.round(num);
    }
    setEditValues(prev => ({
      ...prev,
      [paramName]: param.paramType === 'INT' ? String(num) : String(num),
    }));
  }, [editValues, currentValues, params]);

  // Collect changed params
  const changedParams = params.filter(p => {
    const current = currentValues[p.name];
    const edit = parseFloat(editValues[p.name] || '');
    if (current === null || current === undefined || isNaN(edit)) return false;
    return Math.abs(current - edit) > 0.0001;
  });

  // Reset all to DYX defaults
  const handleResetDefaults = () => {
    const defaults: Record<string, string> = {};
    params.forEach(p => {
      defaults[p.name] = p.paramType === 'INT'
        ? String(p.defaultValue)
        : String(p.defaultValue);
    });
    setEditValues(defaults);
  };

  // Apply all changes
  const handleApplyAll = async () => {
    if (changedParams.length === 0 || !isConnected) return;

    setIsApplying(true);
    const statusMap: Record<string, 'idle' | 'applying' | 'success' | 'error'> = {};
    changedParams.forEach(p => { statusMap[p.name] = 'applying'; });
    setApplyStatus(prev => ({ ...prev, ...statusMap }));

    let hasRebootParam = false;

    for (const param of changedParams) {
      const newValue = parseFloat(editValues[param.name]);
      if (isNaN(newValue)) continue;

      setApplyStatus(prev => ({ ...prev, [param.name]: 'applying' }));

      try {
        const result = await services.setParam(param.name, newValue);
        if (!mountedRef.current) return;

        if (result.success) {
          setApplyStatus(prev => ({ ...prev, [param.name]: 'success' }));
          setCurrentValues(prev => ({ ...prev, [param.name]: newValue }));
          if (param.rebootRequired) hasRebootParam = true;
        } else {
          setApplyStatus(prev => ({ ...prev, [param.name]: 'error' }));
          console.warn(`[RobotSettings] setParam failed: ${param.name}`, result.message);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setApplyStatus(prev => ({ ...prev, [param.name]: 'error' }));
        console.error(`[RobotSettings] setParam error: ${param.name}`, err);
      }
    }

    if (mountedRef.current) {
      setIsApplying(false);
      // Clear status after 3s
      setTimeout(() => {
        if (mountedRef.current) {
          const reset: Record<string, 'idle'> = {};
          changedParams.forEach(p => { reset[p.name] = 'idle'; });
          setApplyStatus(prev => ({ ...prev, ...reset }));
        }
      }, 3000);

      if (hasRebootParam) {
        Alert.alert(
          'Reboot Required',
          'Some parameters require a vehicle reboot to take effect. Please power-cycle the rover.',
          [{ text: 'OK', style: 'default' }]
        );
      }
    }
  };

  const anyLoading = Object.values(loadingParams).some(v => v);

  return (
    <KeyboardAvoidingView
      style={styles.panelContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Panel Header */}
      <View style={styles.panelHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.panelHeaderCenter}>
          <Ionicons name={categoryInfo.iconName as any} size={20} color={colors.accent} />
          <Text style={styles.panelTitle}>{categoryInfo.title}</Text>
        </View>
        <TouchableOpacity onPress={handleResetDefaults} style={styles.resetButton}>
          <Ionicons name="refresh-outline" size={18} color={colors.textMuted} />
          <Text style={styles.resetText}>Defaults</Text>
        </TouchableOpacity>
      </View>

      {/* Connection warning */}
      {!isConnected && (
        <View style={styles.warningBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
          <Text style={styles.warningText}>
            Not connected — showing defaults. Connect to read/write rover params.
          </Text>
        </View>
      )}

      {/* Param rows */}
      <ScrollView
        style={[styles.tableScroll, styles.listContainer]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {params.map((param) => (
          <ParamRow
            key={param.name}
            param={param}
            currentValue={currentValues[param.name] ?? null}
            isLoading={loadingParams[param.name] || false}
            editValue={editValues[param.name] || ''}
            isEditing={editingParam === param.name}
            onStartEdit={() => setEditingParam(param.name)}
            onChangeText={(text) => handleChangeText(param.name, text)}
            onEndEdit={() => handleEndEdit(param.name)}
            applyStatus={applyStatus[param.name] || 'idle'}
          />
        ))}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Apply All Button (sticky bottom) */}
      <View style={styles.applyBar}>
        <TouchableOpacity
          style={[
            styles.applyAllButton,
            (changedParams.length === 0 || !isConnected || isApplying) && styles.applyAllButtonDisabled,
          ]}
          onPress={handleApplyAll}
          disabled={changedParams.length === 0 || !isConnected || isApplying}
        >
          {isApplying ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.text} />
              <Text style={styles.applyAllText}>
                {changedParams.length > 0
                  ? `Apply ${changedParams.length} Change${changedParams.length > 1 ? 's' : ''}`
                  : 'No Changes'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// ─── Main Modal ───

export const RobotSettingsModal: React.FC<RobotSettingsModalProps> = ({
  visible,
  onClose,
}) => {
  const { services, connectionState } = useRover();
  const isConnected = connectionState === 'connected';
  const [activeCategory, setActiveCategory] = useState<ConfigCategory | null>(null);

  // Reset category when modal closes
  useEffect(() => {
    if (!visible) {
      setActiveCategory(null);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {activeCategory === null ? (
          <>
            {/* Modal Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconWrap}>
                  <Ionicons name="settings-outline" size={20} color={colors.accent} />
                </View>
                <Text style={styles.headerTitle}>Robot Settings</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Connection status */}
            <View style={styles.statusRow}>
              <View style={[
                styles.statusBadge,
                { backgroundColor: isConnected ? colors.success + '18' : colors.danger + '18',
                  borderColor: isConnected ? colors.success + '55' : colors.danger + '55' },
              ]}>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: isConnected ? colors.success : colors.danger },
                ]} />
                <Text style={[
                  styles.statusText,
                  { color: isConnected ? colors.success : colors.danger },
                ]}>
                  {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                </Text>
              </View>
              <Text style={styles.statusHint}>
                {isConnected ? 'Reading live values from rover' : 'Connect to read/write params'}
              </Text>
            </View>

            {/* Category Cards */}
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {Object.values(CATEGORIES).map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.categoryCard}
                  onPress={() => setActiveCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.categoryCardLeft}>
                    <View style={styles.categoryIcon}>
                      <Ionicons name={cat.iconName as any} size={22} color={colors.accent} />
                    </View>
                    <View style={styles.categoryText}>
                      <Text style={styles.categoryTitle}>{cat.title}</Text>
                      <Text style={styles.categorySubtitle}>{cat.subtitle}</Text>
                    </View>
                  </View>
                  <View style={styles.categoryRight}>
                    <View style={styles.paramCountBadge}>
                      <Text style={styles.paramCountText}>{cat.params.length}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </>
        ) : (
          <CategoryPanel
            category={activeCategory}
            onBack={() => setActiveCategory(null)}
            services={services}
            isConnected={isConnected}
          />
        )}
      </View>
    </Modal>
  );
};

// ─── Styles ───

const styles = StyleSheet.create({
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#070C15', // Sleek deep slate
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,212,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,212,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Status row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statusHint: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
  },

  // Content
  content: {
    flex: 1,
    padding: 20,
  },

  // Category Cards
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  categoryCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,212,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,212,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.3,
  },
  categorySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 3,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paramCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  paramCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
  },

  // Panel
  panelContainer: {
    flex: 1,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelHeaderCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  resetText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },

  // Warning banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,59,48,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.2)',
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '600',
  },

  listContainer: {
    paddingTop: 8,
  },
  tableScroll: {
    flex: 1,
  },

  // Param row
  // Param row
  paramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
    minHeight: 56,
  },
  paramInfo: {
    flex: 2,
    paddingRight: 8,
  },
  paramNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paramName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  rebootBadge: {
    backgroundColor: 'rgba(255,59,48,0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rebootBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FF3B30',
    letterSpacing: 0.5,
  },
  paramDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 16,
  },
  currentValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
    gap: 6,
  },
  currentValueLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  paramCurrentValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  paramNoValue: {
    fontSize: 12,
    color: '#475569',
  },

  // Edit value column
  paramEditCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  paramValueBtn: {
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paramValueBtnChanged: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,212,0,0.1)',
  },
  paramValueBtnSuccess: {
    borderColor: colors.success,
    backgroundColor: 'rgba(255,212,0,0.1)',
  },
  paramValueBtnError: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(255,59,48,0.1)',
  },
  paramEditValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  paramEditValueChanged: {
    color: colors.accent,
  },
  paramInput: {
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1.5,
    borderColor: colors.accent,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  paramInputChanged: {
    borderColor: colors.accent,
  },
  paramUnit: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
  },
  editIcon: {
    position: 'absolute',
    top: -4,
    right: -4,
  },

  // Apply bar
  applyBar: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(11,17,33,0.95)',
  },
  applyAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  applyAllButtonDisabled: {
    opacity: 0.3,
  },
  applyAllText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
});
