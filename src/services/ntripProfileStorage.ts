/**
 * NTRIP Profile Storage Service
 * Manages CRUD operations for NTRIP profiles using AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NTRIPProfile, NTRIPProfileCreate, NTRIPProfileUpdate } from '../types/ntrip';

const STORAGE_KEY = '@ntrip_profiles';

/**
 * Get all NTRIP profiles
 */
export const getAllProfiles = async (): Promise<NTRIPProfile[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (error) {
    console.error('[NTRIP Storage] Error loading profiles:', error);
    return [];
  }
};

/**
 * Get a single profile by ID
 */
export const getProfileById = async (id: string): Promise<NTRIPProfile | null> => {
  try {
    const profiles = await getAllProfiles();
    return profiles.find(p => p.id === id) || null;
  } catch (error) {
    console.error('[NTRIP Storage] Error getting profile:', error);
    return null;
  }
};

/**
 * Create a new NTRIP profile
 */
export const createProfile = async (profile: NTRIPProfileCreate): Promise<NTRIPProfile> => {
  try {
    const profiles = await getAllProfiles();
    const now = new Date().toISOString();
    const newProfile: NTRIPProfile = {
      ...profile,
      id: `ntrip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };

    profiles.push(newProfile);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    console.log('[NTRIP Storage] Profile created:', newProfile.id);
    return newProfile;
  } catch (error) {
    console.error('[NTRIP Storage] Error creating profile:', error);
    throw error;
  }
};

/**
 * Update an existing NTRIP profile
 */
export const updateProfile = async (
  id: string,
  updates: NTRIPProfileUpdate
): Promise<NTRIPProfile | null> => {
  try {
    const profiles = await getAllProfiles();
    const index = profiles.findIndex(p => p.id === id);

    if (index === -1) {
      console.warn('[NTRIP Storage] Profile not found:', id);
      return null;
    }

    const updatedProfile: NTRIPProfile = {
      ...profiles[index],
      ...updates,
      id: profiles[index].id, // Ensure ID doesn't change
      createdAt: profiles[index].createdAt, // Preserve creation date
      updatedAt: new Date().toISOString(),
    };

    profiles[index] = updatedProfile;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    console.log('[NTRIP Storage] Profile updated:', id);
    return updatedProfile;
  } catch (error) {
    console.error('[NTRIP Storage] Error updating profile:', error);
    throw error;
  }
};

/**
 * Delete an NTRIP profile
 */
export const deleteProfile = async (id: string): Promise<boolean> => {
  try {
    const profiles = await getAllProfiles();
    const filteredProfiles = profiles.filter(p => p.id !== id);

    if (filteredProfiles.length === profiles.length) {
      console.warn('[NTRIP Storage] Profile not found for deletion:', id);
      return false;
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filteredProfiles));
    console.log('[NTRIP Storage] Profile deleted:', id);
    return true;
  } catch (error) {
    console.error('[NTRIP Storage] Error deleting profile:', error);
    throw error;
  }
};

/**
 * Clear all profiles (for testing/reset)
 */
export const clearAllProfiles = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('[NTRIP Storage] All profiles cleared');
  } catch (error) {
    console.error('[NTRIP Storage] Error clearing profiles:', error);
    throw error;
  }
};
