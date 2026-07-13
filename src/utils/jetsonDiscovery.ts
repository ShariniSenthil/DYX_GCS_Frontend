/**
 * Jetson Auto-Discovery Utility
 * Scans local network to find available Jetson devices
 */

import axios from 'axios';

export interface JetsonDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  url: string;
  responseTime: number;
}

/**
 * Allowed IP pools and priority ordering (only these are scanned)
 * Priority order: 102 -> 212 -> 213 -> remaining allowed IPs
 */
const ALLOWED_IP_RANGES = [
  { start: 100, end: 105 },
  { start: 210, end: 215 },
  { start: 25, end: 35 },
];

function expandRange(baseIP: string, start: number, end: number): string[] {
  const list: string[] = [];
  for (let i = start; i <= end; i++) {
    list.push(`${baseIP}.${i}`);
  }
  return list;
}

const BASE_IP_PREFIX = '192.168.1';

// Master list of allowed discovery IPs (deduped)
export const ALLOWED_DISCOVERY_IPS: string[] = Array.from(
  new Set(
    ALLOWED_IP_RANGES.flatMap(({ start, end }) => expandRange(BASE_IP_PREFIX, start, end))
  )
);

// Priority order within allowed IPs
export const PRIORITY_BACKEND_IPS: string[] = [
  '192.168.1.102',
  '192.168.1.102',
  '192.168.1.213',
  '192.168.1.100',
  '192.168.1.101',
  '192.168.1.103',
  '192.168.1.104',
  '192.168.1.105',
  '192.168.1.210',
  '192.168.1.211',
  '192.168.1.214',
  '192.168.1.215',
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

/**
 * Test if a Jetson device is available at the given IP
 */
async function testJetsonConnection(ip: string, port: number = 5001): Promise<JetsonDevice | null> {
  const url = `http://${ip}:${port}`;
  const startTime = Date.now();

  try {
    // Try multiple endpoints to detect backend server
    // Using a short timeout to speed up scanning
    const endpoints = ['/api/healthz', '/api/ping', '/api/rtk/status', '/'];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${url}${endpoint}`, {
          timeout: 5000, // 5 second timeout
          validateStatus: (status) => status < 500, // Accept any non-server-error response
        });

        const responseTime = Date.now() - startTime;

        // If we get any response, it's likely a Jetson device
        if (response.status < 500) {
          return {
            id: ip.replace(/\./g, '-'),
            name: `Rover ${ip.split('.').pop()}`, // Use last IP octet as identifier
            ip,
            port,
            url,
            responseTime,
          };
        }
      } catch (endpointError) {
        // Try next endpoint
        continue;
      }
    }
  } catch (error) {
    // Connection failed, not a valid Jetson device
    return null;
  }

  return null;
}

/**
 * Scan only the allowed IPs to find Jetson devices
 * Priority IPs are tried first, then the remaining allowed IPs
 * @param baseIP - Base IP address (e.g., "192.168.1")
 * @param startRange - Start of IP range (used to further filter allowed list)
 * @param endRange - End of IP range (used to further filter allowed list)
 * @param onProgress - Callback for progress updates
 */
export async function scanForJetsonDevices(
  baseIP: string = '192.168.1',
  startRange: number = 1,
  endRange: number = 255,
  onProgress?: (current: number, total: number) => void
): Promise<JetsonDevice[]> {
  // Build the candidate list from allowed IPs only
  const candidateIPs = ALLOWED_DISCOVERY_IPS.filter(ip => {
    const parts = ip.split('.');
    const lastOctet = parseInt(parts[3]);
    return parts.slice(0, 3).join('.') === baseIP && lastOctet >= startRange && lastOctet <= endRange;
  });

  const total = candidateIPs.length;
  if (total === 0) return [];

  const devices: JetsonDevice[] = [];
  const scannedIPs = new Set<string>();

  // Step 1: Check priority IPs first (limited to allowed candidates)
  const priorityIPs = PRIORITY_BACKEND_IPS.filter(ip => candidateIPs.includes(ip));

  for (let i = 0; i < priorityIPs.length; i++) {
    const device = await testJetsonConnection(priorityIPs[i]);
    if (device) {
      devices.push(device);
    }
    scannedIPs.add(priorityIPs[i]);

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  // Step 2: Scan remaining allowed IPs sequentially (order preserved)
  let scannedCount = priorityIPs.length;
  for (const ip of candidateIPs) {
    if (scannedIPs.has(ip)) continue;

    const device = await testJetsonConnection(ip);
    if (device) {
      devices.push(device);
    }
    scannedCount += 1;
    if (onProgress) {
      onProgress(scannedCount, total);
    }
  }

  // Sort by priority (priority IPs first), then by IP address
  devices.sort((a, b) => {
    const aIsPriority = PRIORITY_BACKEND_IPS.includes(a.ip);
    const bIsPriority = PRIORITY_BACKEND_IPS.includes(b.ip);

    if (aIsPriority && !bIsPriority) return -1;
    if (!aIsPriority && bIsPriority) return 1;

    const aLast = parseInt(a.ip.split('.').pop() || '0');
    const bLast = parseInt(b.ip.split('.').pop() || '0');
    return aLast - bLast;
  });

  return devices;
}

/**
 * Quick scan over the prioritized allowed IP list (small, fast)
 */
export async function quickScanForJetsonDevices(
  onProgress?: (current: number, total: number) => void
): Promise<JetsonDevice[]> {
  const scanList = PRIORITY_BACKEND_IPS;
  const devices: JetsonDevice[] = [];
  const total = scanList.length;

  for (let i = 0; i < scanList.length; i++) {
    const device = await testJetsonConnection(scanList[i]);
    if (device) {
      devices.push(device);
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return devices;
}

/**
 * Get the local network base IP (best guess)
 * This is a simplified version - in production you might want to use a native module
 */
export function getLocalNetworkBase(): string {
  // Default to common private network range
  // In a real app, you'd get this from network info
  return '192.168.1';
}
