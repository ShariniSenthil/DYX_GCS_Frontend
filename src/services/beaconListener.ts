/**
 * UDP beacon discovery for the rover GCS.
 *
 * UDP is a discovery hint only. HTTP /api/health is the authority
 * for whether a rover stays visible. This module never deletes a rover
 * just because beacons stopped arriving.
 */

import { Platform } from "react-native";

let dgram: any = null;
if (Platform.OS !== "web") {
  try {
    dgram = require("react-native-udp");
  } catch (error) {
    console.warn("[BeaconListener] react-native-udp not available:", error);
  }
}

export interface DiscoveredRover {
  roverId: string;
  roverName: string;
  ip: string;
  port: number;
  url: string;
  version: string;
  uptime: number;
  lastBeaconSeen: number;
  online: boolean;
  lastHttpSeen?: number;
}

export type BeaconCallback = (rovers: DiscoveredRover[]) => void;

export const BEACON_PORT = 5002;
export const BEACON_STALE_MS = 15_000;

function isUsableIpv4(value: string): boolean {
  const parts = value.trim().split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

class BeaconListener {
  private static instance: BeaconListener;
  private rovers = new Map<string, DiscoveredRover>();
  private socket: any = null;
  private onChange: BeaconCallback | null = null;
  private _listening = false;

  get isAvailable(): boolean {
    return dgram !== null && Platform.OS !== "web";
  }

  static getInstance(): BeaconListener {
    if (!BeaconListener.instance) {
      BeaconListener.instance = new BeaconListener();
    }
    return BeaconListener.instance;
  }

  start(onChange: BeaconCallback): void {
    this.onChange = onChange;

    if (!this.isAvailable) {
      console.warn(
        "[BeaconListener] UDP not available on this platform; HTTP discovery still works",
      );
      this.emit();
      return;
    }

    if (this._listening) {
      this.emit();
      return;
    }

    this._listening = true;

    try {
      this.socket = dgram.createSocket({
        type: "udp4",
        reusePort: true,
        reuseAddr: true,
      });

      this.socket.on("error", (err: Error) => {
        console.error("[BeaconListener] UDP error:", err);
      });

      this.socket.on(
        "message",
        (msg: Buffer, rinfo: { address: string; port: number }) => {
          try {
            this.handleBeacon(msg, rinfo);
          } catch (err) {
            console.warn(
              "[BeaconListener] Invalid beacon from",
              rinfo.address,
              err,
            );
          }
        },
      );

      this.socket.bind(BEACON_PORT, "0.0.0.0", () => {
        console.log(
          "[BeaconListener] Listening on UDP",
          `0.0.0.0:${BEACON_PORT}`,
        );
      });
    } catch (error) {
      console.error("[BeaconListener] Failed to start UDP listener:", error);
      this._listening = false;
    }

    this.emit();
  }

  private handleBeacon(
    msg: Buffer,
    rinfo: { address: string; port: number },
  ): void {
    const parsed = JSON.parse(msg.toString());

    const knownTypes = new Set([
      "rover_beacon",
      "drawing",
      "px4",
      "rover",
    ]);

    if (parsed.type && !knownTypes.has(parsed.type)) {
      return;
    }

    const roverId = String(parsed.rover_id || parsed.id || "").trim();
    // Do not trust an advertised address from an unauthenticated UDP beacon.
    // A beacon is only a discovery hint; connect back to the sender address.
    const ip = isUsableIpv4(rinfo.address) ? rinfo.address : "";

    const parsedPort = Number(parsed.port);
    const port =
      Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
        ? parsedPort
        : 5001;

    if (!roverId || !ip) {
      return;
    }

    const now = Date.now();
    const existing = this.rovers.get(roverId);

    const rover: DiscoveredRover = {
      roverId,
      roverName:
        parsed.rover_name || parsed.name || existing?.roverName || roverId,
      ip,
      port,
      url: `http://${ip}:${port}`,
      version: parsed.version || existing?.version || "1.0",
      uptime: Number(parsed.uptime) || 0,
      lastBeaconSeen: now,
      online: existing?.online ?? true,
      lastHttpSeen: existing?.lastHttpSeen,
    };

    console.log(
      "[BeaconListener] Received beacon:",
      rover.roverName,
      `${rover.ip}:${rover.port}`,
      "source=",
      rinfo.address,
    );

    this.rovers.set(roverId, rover);
    this.emit();
  }

  updateHttpStatus(roverId: string, online: boolean): void {
    const rover = this.rovers.get(roverId);
    if (!rover) {
      return;
    }

    rover.online = online;
    if (online) {
      rover.lastHttpSeen = Date.now();
    }

    this.rovers.set(roverId, rover);
    this.emit();
  }

  addOrUpdateRover(rover: DiscoveredRover): void {
    const existing = this.rovers.get(rover.roverId);
    this.rovers.set(rover.roverId, {
      ...existing,
      ...rover,
      url: `http://${rover.ip}:${rover.port}`,
    });
    this.emit();
  }

  getDiscoveredRovers(): DiscoveredRover[] {
    return Array.from(this.rovers.values()).sort((a, b) =>
      a.roverName.localeCompare(b.roverName),
    );
  }

  isListening(): boolean {
    return this._listening;
  }

  waitForFirst(timeoutMs: number = 5000): Promise<DiscoveredRover | null> {
    const existing = this.getDiscoveredRovers();
    if (existing.length > 0) {
      return Promise.resolve(existing[0]);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(this.getDiscoveredRovers()[0] ?? null);
      }, timeoutMs);

      const previous = this.onChange;
      this.onChange = (rovers) => {
        previous?.(rovers);
        if (rovers.length > 0) {
          clearTimeout(timeout);
          this.onChange = previous;
          resolve(rovers[0]);
        }
      };
    });
  }

  private emit(): void {
    this.onChange?.(this.getDiscoveredRovers());
  }

  stop(): void {
    this._listening = false;
    this.onChange = null;

    if (this.socket) {
      try {
        this.socket.close();
      } catch (err) {
        console.warn("[BeaconListener] socket close failed", err);
      }
      this.socket = null;
    }
  }
}

const beaconListener = BeaconListener.getInstance();
export default beaconListener;
export { BeaconListener };
