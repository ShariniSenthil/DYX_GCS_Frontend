/**
 * Param Preset Storage Service
 *
 * Manages CRUD operations for MAVLink parameter presets using AsyncStorage.
 * Follows the same pattern as ntripProfileStorage.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParamPreset } from '../types/params';

const STORAGE_KEY = '@param_presets';

/**
 * Get all param presets
 */
export const getAllPresets = async (): Promise<ParamPreset[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (error) {
    console.error('[Param Preset Storage] Error loading presets:', error);
    return [];
  }
};

/**
 * Get a single preset by ID
 */
export const getPresetById = async (id: string): Promise<ParamPreset | null> => {
  try {
    const presets = await getAllPresets();
    return presets.find(p => p.id === id) || null;
  } catch (error) {
    console.error('[Param Preset Storage] Error getting preset:', error);
    return null;
  }
};

/**
 * Create a new param preset
 */
export const createPreset = async (
  preset: Omit<ParamPreset, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ParamPreset> => {
  try {
    const presets = await getAllPresets();
    const now = new Date().toISOString();
    const newPreset: ParamPreset = {
      ...preset,
      id: `param_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };

    presets.push(newPreset);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    console.log('[Param Preset Storage] Preset created:', newPreset.id);
    return newPreset;
  } catch (error) {
    console.error('[Param Preset Storage] Error creating preset:', error);
    throw error;
  }
};

/**
 * Update an existing param preset
 */
export const updatePreset = async (
  id: string,
  updates: Partial<Omit<ParamPreset, 'id' | 'createdAt'>>
): Promise<ParamPreset | null> => {
  try {
    const presets = await getAllPresets();
    const index = presets.findIndex(p => p.id === id);

    if (index === -1) {
      console.warn('[Param Preset Storage] Preset not found:', id);
      return null;
    }

    const updatedPreset: ParamPreset = {
      ...presets[index],
      ...updates,
      id: presets[index].id,
      createdAt: presets[index].createdAt,
      updatedAt: new Date().toISOString(),
    };

    presets[index] = updatedPreset;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    console.log('[Param Preset Storage] Preset updated:', id);
    return updatedPreset;
  } catch (error) {
    console.error('[Param Preset Storage] Error updating preset:', error);
    throw error;
  }
};

/**
 * Delete a param preset
 */
export const deletePreset = async (id: string): Promise<boolean> => {
  try {
    const presets = await getAllPresets();
    const filteredPresets = presets.filter(p => p.id !== id);

    if (filteredPresets.length === presets.length) {
      console.warn('[Param Preset Storage] Preset not found for deletion:', id);
      return false;
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filteredPresets));
    console.log('[Param Preset Storage] Preset deleted:', id);
    return true;
  } catch (error) {
    console.error('[Param Preset Storage] Error deleting preset:', error);
    throw error;
  }
};

/**
 * Clear all presets (for testing/reset)
 */
export const clearAllPresets = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('[Param Preset Storage] All presets cleared');
  } catch (error) {
    console.error('[Param Preset Storage] Error clearing presets:', error);
    throw error;
  }
};

/**
 * QuickTune-specific helper: Save current param values as a preset
 */
export const saveQuickTunePreset = async (
  name: string,
  params: Record<string, number>,
  description?: string
): Promise<ParamPreset> => {
  return createPreset({
    name,
    description,
    params,
  });
};

/**
 * QuickTune-specific helper: Apply a preset's param values
 * Returns the params Record to be applied via services.setParam()
 */
export const getQuickTunePresetParams = async (id: string): Promise<Record<string, number> | null> => {
  const preset = await getPresetById(id);
  return preset?.params ?? null;
};
