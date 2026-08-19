/**
 * Backend URL Storage Utility
 * Manages persistent storage of selected backend URL
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL_KEY = '@backend_url';
const BACKEND_IP_KEY = '@backend_ip';
const BACKEND_PORT_KEY = '@backend_port';
const SESSION_SKIP_KEY = '@session_skip_discovery';
const KNOWN_ROVERS_KEY = '@known_rovers';

export interface KnownRover {
  roverId: string;
  roverName: string;
  ip: string;
  port: number;
}

/**
 * Save backend URL to persistent storage
 */
export async function saveBackendURL(url: string, ip: string, port: number = 5001): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [BACKEND_URL_KEY, url],
      [BACKEND_IP_KEY, ip],
      [BACKEND_PORT_KEY, port.toString()],
    ]);
  } catch (error) {
    console.error('Failed to save backend URL:', error);
    throw error;
  }
}

/**
 * Get saved backend URL from persistent storage.
 */
export async function getSavedBackendURL(): Promise<string | null> {
  try {
    const url = await AsyncStorage.getItem(BACKEND_URL_KEY);
    return url;
  } catch (error) {
    console.error('Failed to get backend URL:', error);
    return null;
  }
}

/**
 * Get saved backend IP from persistent storage
 */
export async function getSavedBackendIP(): Promise<string | null> {
  try {
    const ip = await AsyncStorage.getItem(BACKEND_IP_KEY);
    return ip;
  } catch (error) {
    console.error('Failed to get backend IP:', error);
    return null;
  }
}

/**
 * Get saved backend port from persistent storage
 */
export async function getSavedBackendPort(): Promise<number> {
  try {
    const port = await AsyncStorage.getItem(BACKEND_PORT_KEY);
    return port ? parseInt(port, 10) : 5001;
  } catch (error) {
    console.error('Failed to get backend port:', error);
    return 5001;
  }
}

/**
 * Clear saved backend URL
 */
export async function clearBackendURL(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([BACKEND_URL_KEY, BACKEND_IP_KEY, BACKEND_PORT_KEY]);
  } catch (error) {
    console.error('Failed to clear backend URL:', error);
    throw error;
  }
}

/**
 * Check if backend URL is configured
 */
export async function hasBackendURL(): Promise<boolean> {
  try {
    const url = await AsyncStorage.getItem(BACKEND_URL_KEY);
    return url !== null;
  } catch (error) {
    console.error('Failed to check backend URL:', error);
    return false;
  }
}

/**
 * Mark that the user has skipped discovery for this session
 */
export async function markSessionSkipped(): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_SKIP_KEY, 'true');
  } catch (error) {
    console.error('Failed to mark session skip:', error);
    throw error;
  }
}

/**
 * Check if user has skipped discovery in this session
 */
export async function hasSessionSkipped(): Promise<boolean> {
  try {
    const skipped = await AsyncStorage.getItem(SESSION_SKIP_KEY);
    return skipped === 'true';
  } catch (error) {
    console.error('Failed to check session skip:', error);
    return false;
  }
}

/**
 * Clear session skip flag (called on app fresh start)
 */
export async function clearSessionSkip(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_SKIP_KEY);
  } catch (error) {
    console.error('Failed to clear session skip:', error);
    throw error;
  }
}

export async function loadKnownRovers(): Promise<KnownRover[]> {
  try {
    const raw = await AsyncStorage.getItem(KNOWN_ROVERS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is KnownRover =>
        item &&
        typeof item.roverId === "string" &&
        typeof item.ip === "string" &&
        typeof item.port === "number",
    );
  } catch (error) {
    console.error("Failed to load known rovers:", error);
    return [];
  }
}

export async function rememberRover(rover: KnownRover): Promise<void> {
  try {
    const current = await loadKnownRovers();
    const next = [
      rover,
      ...current.filter((item) => item.roverId !== rover.roverId),
    ].slice(0, 8);
    await AsyncStorage.setItem(KNOWN_ROVERS_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Failed to remember rover:", error);
  }
}
