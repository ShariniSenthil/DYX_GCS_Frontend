/**
 * HTTP presence for discovered rovers.
 *
 * UDP beacons only hint that a rover exists. This module is the authority:
 * GET /api/health must return ok + type=rover_backend before a rover is
 * treated as online. Three failed checks mark it offline; the card stays.
 */

import beaconListener, { DiscoveredRover } from "./beaconListener";
import {
  loadKnownRovers,
  rememberRover,
  KnownRover,
} from "../utils/backendStorage";

export const HEALTH_INTERVAL_MS = 5000;
export const HEALTH_TIMEOUT_MS = 1500;
export const MAX_FAILURES = 3;
export const SCAN_CONCURRENCY = 20;
export const ROVER_API_PORT = 5001;

const failures = new Map<string, number>();

export interface RoverHealthBody {
  ok: boolean;
  type?: string;
  rover_id?: string;
  rover_name?: string;
  port?: number;
  version?: string;
}

export function isRoverHealth(body: unknown): body is RoverHealthBody {
  if (!body || typeof body !== "object") {
    return false;
  }
  const value = body as RoverHealthBody;
  return (
    value.ok === true &&
    value.type === "rover_backend" &&
    typeof value.rover_id === "string" &&
    value.rover_id.length > 0
  );
}

export async function fetchRoverHealth(
  url: string,
): Promise<RoverHealthBody | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/api/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const body = await response.json();
    return isRoverHealth(body) ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkRover(rover: DiscoveredRover): Promise<boolean> {
  const body = await fetchRoverHealth(rover.url);
  return body !== null && body.rover_id === rover.roverId;
}

function roverFromHealth(
  ip: string,
  port: number,
  body: RoverHealthBody,
  existing?: DiscoveredRover,
): DiscoveredRover {
  const now = Date.now();
  return {
    roverId: body.rover_id as string,
    roverName: body.rover_name || existing?.roverName || body.rover_id || ip,
    ip,
    port: Number(body.port) || port,
    url: `http://${ip}:${Number(body.port) || port}`,
    version: body.version || existing?.version || "1.0",
    uptime: existing?.uptime || 0,
    lastBeaconSeen: existing?.lastBeaconSeen || 0,
    online: true,
    lastHttpSeen: now,
  };
}

export async function applyHealthResult(rover: DiscoveredRover): Promise<boolean> {
  const online = await checkRover(rover);

  if (online) {
    failures.set(rover.roverId, 0);
    beaconListener.updateHttpStatus(rover.roverId, true);
    await rememberRover({
      roverId: rover.roverId,
      roverName: rover.roverName,
      ip: rover.ip,
      port: rover.port,
    });
    return true;
  }

  const count = (failures.get(rover.roverId) ?? 0) + 1;
  failures.set(rover.roverId, count);
  if (count >= MAX_FAILURES) {
    beaconListener.updateHttpStatus(rover.roverId, false);
  }
  return false;
}

export async function refreshAllHealth(): Promise<void> {
  const rovers = beaconListener.getDiscoveredRovers();
  await Promise.all(rovers.map((rover) => applyHealthResult(rover)));
}

export async function restoreKnownRovers(): Promise<DiscoveredRover[]> {
  const known = await loadKnownRovers();
  const restored: DiscoveredRover[] = [];

  for (const item of known) {
    const rover: DiscoveredRover = {
      roverId: item.roverId,
      roverName: item.roverName || item.roverId,
      ip: item.ip,
      port: item.port,
      url: `http://${item.ip}:${item.port}`,
      version: "1.0",
      uptime: 0,
      lastBeaconSeen: 0,
      online: false,
    };
    beaconListener.addOrUpdateRover(rover);
    const ok = await applyHealthResult(rover);
    if (ok) {
      restored.push(rover);
    }
  }

  return restored;
}

export function subnetPrefixFromIp(ip: string): string | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function discoveryPrefixes(): string[] {
  const prefixes = new Set<string>();
  for (const rover of beaconListener.getDiscoveredRovers()) {
    const prefix = subnetPrefixFromIp(rover.ip);
    if (prefix) {
      prefixes.add(prefix);
    }
  }
  return Array.from(prefixes);
}

async function probeHost(
  ip: string,
  port: number = ROVER_API_PORT,
): Promise<DiscoveredRover | null> {
  const body = await fetchRoverHealth(`http://${ip}:${port}`);
  if (!body) {
    return null;
  }
  return roverFromHealth(ip, port, body);
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function run(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  }

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

export async function scanSubnet(
  prefix: string,
  onProgress?: (current: number, total: number) => void,
): Promise<DiscoveredRover[]> {
  const candidates: string[] = [];
  for (let host = 1; host <= 254; host += 1) {
    candidates.push(`${prefix}.${host}`);
  }

  let done = 0;
  const found: DiscoveredRover[] = [];

  await mapPool(candidates, SCAN_CONCURRENCY, async (ip) => {
    const rover = await probeHost(ip);
    done += 1;
    onProgress?.(done, candidates.length);
    if (rover) {
      beaconListener.addOrUpdateRover(rover);
      failures.set(rover.roverId, 0);
      await rememberRover({
        roverId: rover.roverId,
        roverName: rover.roverName,
        ip: rover.ip,
        port: rover.port,
      });
      found.push(rover);
    }
    return rover;
  });

  return found;
}

export async function scanKnownPrefixes(
  extraPrefixes: string[] = [],
  onProgress?: (current: number, total: number) => void,
): Promise<DiscoveredRover[]> {
  const prefixes = Array.from(
    new Set([...discoveryPrefixes(), ...extraPrefixes]),
  );
  const found: DiscoveredRover[] = [];
  for (const prefix of prefixes) {
    const batch = await scanSubnet(prefix, onProgress);
    found.push(...batch);
  }
  return found;
}

export async function knownRoverRecords(): Promise<KnownRover[]> {
  return loadKnownRovers();
}
