/**
 * Robot Config Preset Storage Service
 *
 * Manages CRUD operations for robot parameter presets using AsyncStorage.
 * Stores sets of param name→value pairs that can be saved/loaded.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParamPreset } from '../types/params';

const STORAGE_KEY = '@robot_config_presets';

/**
 * Get all robot config presets
 */
export const getAllPresets = async (): Promise<ParamPreset[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (error) {
    console.error('[Robot Config Storage] Error loading presets:', error);
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
    console.error('[Robot Config Storage] Error getting preset:', error);
    return null;
  }
};

/**
 * Create a new robot config preset
 */
export const createPreset = async (preset: Omit<ParamPreset, 'id' | 'createdAt' | 'updatedAt'>): Promise<ParamPreset> => {
  try {
    const presets = await getAllPresets();
    const now = new Date().toISOString();
    const newPreset: ParamPreset = {
      ...preset,
      id: `robot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };

    presets.push(newPreset);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    console.log('[Robot Config Storage] Preset created:', newPreset.id);
    return newPreset;
  } catch (error) {
    console.error('[Robot Config Storage] Error creating preset:', error);
    throw error;
  }
};

/**
 * Update an existing robot config preset
 */
export const updatePreset = async (
  id: string,
  updates: Partial<Omit<ParamPreset, 'id' | 'createdAt'>>
): Promise<ParamPreset | null> => {
  try {
    const presets = await getAllPresets();
    const index = presets.findIndex(p => p.id === id);

    if (index === -1) {
      console.warn('[Robot Config Storage] Preset not found:', id);
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
    console.log('[Robot Config Storage] Preset updated:', id);
    return updatedPreset;
  } catch (error) {
    console.error('[Robot Config Storage] Error updating preset:', error);
    throw error;
  }
};

/**
 * Delete a robot config preset
 */
export const deletePreset = async (id: string): Promise<boolean> => {
  try {
    const presets = await getAllPresets();
    const filteredPresets = presets.filter(p => p.id !== id);

    if (filteredPresets.length === presets.length) {
      console.warn('[Robot Config Storage] Preset not found for deletion:', id);
      return false;
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filteredPresets));
    console.log('[Robot Config Storage] Preset deleted:', id);
    return true;
  } catch (error) {
    console.error('[Robot Config Storage] Error deleting preset:', error);
    throw error;
  }
};

/**
 * Clear all presets (for testing/reset)
 */
export const clearAllPresets = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('[Robot Config Storage] All presets cleared');
  } catch (error) {
    console.error('[Robot Config Storage] Error clearing presets:', error);
    throw error;
  }
};
