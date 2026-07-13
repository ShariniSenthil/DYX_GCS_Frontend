/**
 * Priority Backend Configuration
 * Configure which backend IPs should be checked first during rover discovery
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIORITY_IPS_KEY = '@priority_backend_ips';

/**
 * Get the current priority backend IPs
 * Returns saved priority IPs or defaults
 */
export async function getPriorityBackendIPs(): Promise<string[]> {
  try {
    const saved = await AsyncStorage.getItem(PRIORITY_IPS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('Failed to get priority backend IPs:', error);
  }

  // Return default priority IPs
  return [
    // Primary range: 100-102
    '192.168.1.100',
    '192.168.1.101',
    '192.168.1.102',

    // Secondary range: 210-214
    '192.168.1.210',
    '192.168.1.211',
    '192.168.1.102',
    '192.168.1.213',
    '192.168.1.214',

    // Tertiary range: 25-35
    '192.168.1.25',
    '192.168.1.26',
    '192.168.1.27',
    '192.168.1.28',
    '192.168.1.29',
    '192.168.1.30',
    '192.168.1.31',
    '192.168.1.32',
    '192.168.1.33',
    '192.168.1.34',
    '192.168.1.35',
  ];
}

/**
 * Save custom priority backend IPs
 * @param ips - Array of IP addresses to prioritize
 */
export async function savePriorityBackendIPs(ips: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRIORITY_IPS_KEY, JSON.stringify(ips));
  } catch (error) {
    console.error('Failed to save priority backend IPs:', error);
    throw error;
  }
}

/**
 * Add a new IP to the priority list
 * @param ip - IP address to add
 */
export async function addPriorityBackendIP(ip: string): Promise<void> {
  const current = await getPriorityBackendIPs();
  if (!current.includes(ip)) {
    current.push(ip);
    await savePriorityBackendIPs(current);
  }
}

/**
 * Remove an IP from the priority list
 * @param ip - IP address to remove
 */
export async function removePriorityBackendIP(ip: string): Promise<void> {
  const current = await getPriorityBackendIPs();
  const filtered = current.filter(existingIp => existingIp !== ip);
  await savePriorityBackendIPs(filtered);
}

/**
 * Reset priority IPs to defaults
 */
export async function resetPriorityBackendIPs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PRIORITY_IPS_KEY);
  } catch (error) {
    console.error('Failed to reset priority backend IPs:', error);
    throw error;
  }
}
