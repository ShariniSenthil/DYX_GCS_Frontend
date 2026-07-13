/**
 * Auto-Connect Utility
 * Attempts beacon discovery on app launch, falls back to legacy scan.
 */

import { JetsonDevice } from './jetsonDiscovery';
import beaconListener from '../services/beaconListener';

/**
 * Attempt auto-connect using beacon discovery.
 * Returns first discovered rover within timeout, or null.
 */
export async function attemptAutoConnect(
  onProgress?: (message: string) => void
): Promise<JetsonDevice | null> {
  // Listen for rover beacons (fast path)
  if (onProgress) onProgress('Listening for rovers...');

  const firstRover = await beaconListener.waitForFirst(5000);

  if (firstRover) {
    if (onProgress) onProgress(`Found ${firstRover.roverName}`);
    return {
      id: firstRover.roverId,
      name: firstRover.roverName,
      ip: firstRover.ip,
      port: firstRover.port,
      url: firstRover.url,
      responseTime: 0,
    };
  }

  if (onProgress) onProgress('No rovers found');
  return null;
}
