/**
 * Beacon Listener Service
 * UDP beacon discovery for rover ground control station
 * 
 * Listens for rover broadcast beacons on UDP port 5002
 * Each rover broadcasts every 2 seconds with:
 * {
 *   "type": "rover_beacon",
 *   "rover_id": "rover-001",
 *   "rover_name": "Alpha",
 *   "ip": "192.168.1.39",
 *   "port": 5001,
 *   "version": "1.0",
 *   "uptime": 24
 * }
 * 
 * NOTE: This only works on native platforms (Android/iOS).
 * On web, isAvailable returns false and all methods are no-ops.
 */

import { Platform } from 'react-native';

// Only import dgram on native platforms
let dgram: any = null;
if (Platform.OS !== 'web') {
    try {
        dgram = require('react-native-udp');
    } catch (e) {
        console.warn('[BeaconListener] react-native-udp not available:', e);
    }
}

// Type definitions for discovered rovers
export interface DiscoveredRover {
    roverId: string;       // "rover-001" from beacon rover_id
    roverName: string;     // "Alpha" from beacon rover_name (or rover_id if missing)
    ip: string;            // "192.168.1.39" from beacon ip
    port: number;          // 5001 from beacon port
    version: string;       // "1.0" from beacon version
    uptime: number;        // seconds from beacon uptime
    lastSeen: number;      // Date.now() when beacon was received
    url: string;           // "http://192.168.1.39:5001" (constructed)
}

export type BeaconCallback = (rovers: DiscoveredRover[]) => void;

// Constants
const BEACON_PORT = 5002;
const STALE_TIMEOUT = 10000;    // 10 seconds - remove rover if no beacon received
const CLEANUP_INTERVAL = 5000;  // check for stale rovers every 5 seconds

/**
 * BeaconListener - Singleton class for UDP beacon discovery
 */
class BeaconListener {
    private static instance: BeaconListener;
    private rovers: Map<string, DiscoveredRover> = new Map();
    private socket: any = null;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private onChange: BeaconCallback | null = null;
    private _listening: boolean = false;

    /**
     * Check if UDP beacon listening is available on this platform
     * Returns false on web, true on native Android/iOS
     */
    get isAvailable(): boolean {
        return dgram !== null && Platform.OS !== 'web';
    }

    /**
     * Get singleton instance
     */
    static getInstance(): BeaconListener {
        if (!BeaconListener.instance) {
            BeaconListener.instance = new BeaconListener();
        }
        return BeaconListener.instance;
    }

    /**
     * Start listening for rover beacons
     * @param onChange Callback fired when rover list changes
     */
    start(onChange: BeaconCallback): void {
        // Check if UDP is available on this platform
        if (!this.isAvailable) {
            console.warn('[BeaconListener] UDP not available on web platform, skipping beacon discovery');
            return;
        }

        // If already listening, stop first
        if (this._listening) {
            this.stop();
        }

        // Save callback
        this.onChange = onChange;
        this._listening = true;

        try {
            // Create UDP socket
            this.socket = dgram.createSocket({ type: 'udp4' });

            // Bind to beacon port
            this.socket.bind(BEACON_PORT, () => {
                console.log('[BeaconListener] Listening on UDP port', BEACON_PORT);
            });

            // Handle incoming messages
            this.socket.on('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
                this.handleBeacon(msg, rinfo);
            });

            // Handle errors
            this.socket.on('error', (err: Error) => {
                console.error('[BeaconListener] Socket error:', err);
                this._listening = false;
            });

            // Start cleanup timer for stale rovers
            this.cleanupTimer = setInterval(() => {
                this.cleanupStale();
            }, CLEANUP_INTERVAL);
        } catch (error) {
            console.error('[BeaconListener] Failed to start UDP listener:', error);
            this._listening = false;
        }
    }

    /**
     * Stop listening for beacons
     * Safe to call multiple times
     */
    stop(): void {
        // Close socket
        if (this.socket) {
            try {
                this.socket.close();
            } catch (e) {
                // Ignore close errors
            }
            this.socket = null;
        }

        // Clear cleanup timer
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        // Reset state (but preserve rovers map for last-known list)
        this._listening = false;
        this.onChange = null;
    }

    /**
     * Get currently discovered rovers
     * @returns Array of rovers sorted by name
     */
    getDiscoveredRovers(): DiscoveredRover[] {
        return Array.from(this.rovers.values()).sort((a, b) =>
            a.roverName.localeCompare(b.roverName)
        );
    }

    /**
     * Check if listener is active
     */
    isListening(): boolean {
        return this._listening;
    }

    /**
     * Wait for first rover to be discovered
     * @param timeoutMs Timeout in milliseconds (default 5000)
     * @returns First discovered rover or null if timeout or UDP not available
     */
    waitForFirst(timeoutMs: number = 5000): Promise<DiscoveredRover | null> {
        // If UDP is not available (web platform), immediately return null
        if (!this.isAvailable) {
            console.log('[BeaconListener] UDP not available, skipping beacon discovery');
            return Promise.resolve(null);
        }

        return new Promise((resolve) => {
            // If we already have rovers, return the first one
            const existing = this.getDiscoveredRovers();
            if (existing.length > 0) {
                resolve(existing[0]);
                return;
            }

            // Set up temporary callback
            const timeout = setTimeout(() => {
                // Remove temporary listener
                if (this.onChange === tempCallback) {
                    this.onChange = null;
                }
                resolve(null);
            }, timeoutMs);

            const tempCallback: BeaconCallback = (rovers) => {
                if (rovers.length > 0) {
                    clearTimeout(timeout);
                    // Don't resolve here - let the caller handle stopping
                    // Just return the first rover
                    resolve(rovers[0]);
                }
            };

            // Start listening if not already
            if (!this._listening) {
                this.start(tempCallback);
            } else {
                this.onChange = tempCallback;
            }
        });
    }

    /**
     * Handle incoming beacon message
     * @param msg Raw UDP message
     * @param rinfo Remote address info
     */
    private handleBeacon(msg: Buffer, rinfo: { address: string; port: number }): void {
        try {
            const raw = msg.toString();
            const parsed = JSON.parse(raw);

            // 4WD_SERVER sends type "drawing"; legacy NRP sends "rover_beacon".
            // Accept known types or any payload with rover_id + reachable host.
            const beaconType = parsed.type as string | undefined;
            const knownTypes = new Set(['rover_beacon', 'drawing', 'px4', 'rover']);
            if (beaconType && !knownTypes.has(beaconType)) {
                return;
            }

            const roverId = parsed.rover_id || parsed.id;
            const ip = parsed.ip || parsed.host || rinfo.address;
            const port = parsed.port ?? 5001;

            if (!roverId || !ip) {
                console.warn('[BeaconListener] Invalid beacon - missing rover_id or ip:', parsed);
                return;
            }

            // Construct DiscoveredRover with defaults for optional fields
            const rover: DiscoveredRover = {
                roverId,
                roverName: parsed.rover_name || parsed.name || roverId,
                ip,
                port,
                version: parsed.version || '1.0',
                uptime: parsed.uptime || 0,
                lastSeen: Date.now(),
                url: `http://${parsed.ip}:${parsed.port}`,
            };

            // Upsert into rovers map
            this.rovers.set(rover.roverId, rover);

            // Notify callback
            if (this.onChange) {
                this.onChange(this.getDiscoveredRovers());
            }

            console.log('[BeaconListener] Received beacon from:', rover.roverName, rover.ip);

        } catch (e) {
            // Ignore parse errors - might be other UDP traffic
            // Silent fail - never crash on bad data
        }
    }

    /**
     * Remove rovers that haven't been seen recently
     */
    private cleanupStale(): void {
        const now = Date.now();
        let changed = false;

        for (const [id, rover] of this.rovers.entries()) {
            if (now - rover.lastSeen > STALE_TIMEOUT) {
                console.log('[BeaconListener] Removing stale rover:', rover.roverName);
                this.rovers.delete(id);
                changed = true;
            }
        }

        // Notify if anything changed
        if (changed && this.onChange) {
            this.onChange(this.getDiscoveredRovers());
        }
    }
}

// Export singleton instance
const beaconListener = BeaconListener.getInstance();
export default beaconListener;
export { BeaconListener };
