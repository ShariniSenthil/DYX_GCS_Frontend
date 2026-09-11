/**
 * Subnet scan used as recovery when UDP beacons fail.
 * Presence is GET /api/health, not "any HTTP 200".
 */

import {
  ROVER_API_PORT,
  fetchRoverHealth,
  scanKnownPrefixes,
  scanSubnet,
  subnetPrefixFromIp,
} from "../services/roverPresence";
import { getSavedBackendIP } from "./backendStorage";

export interface JetsonDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  url: string;
  responseTime: number;
}

export async function getLocalNetworkBase(): Promise<string> {
  const saved = await getSavedBackendIP();
  if (saved) {
    const prefix = subnetPrefixFromIp(saved);
    if (prefix) {
      return prefix;
    }
  }
  return "";
}

export async function testJetsonConnection(
  ip: string,
  port: number = ROVER_API_PORT,
): Promise<JetsonDevice | null> {
  const started = Date.now();
  const body = await fetchRoverHealth(`http://${ip}:${port}`);
  if (!body) {
    return null;
  }
  return {
    id: body.rover_id as string,
    name: body.rover_name || body.rover_id || ip,
    ip,
    port: Number(body.port) || port,
    url: `http://${ip}:${Number(body.port) || port}`,
    responseTime: Date.now() - started,
  };
}

export async function scanForJetsonDevices(
  baseIP?: string,
  _startRange?: number,
  _endRange?: number,
  onProgress?: (current: number, total: number) => void,
): Promise<JetsonDevice[]> {
  const prefix = baseIP || (await getLocalNetworkBase());
  if (!prefix) {
    const found = await scanKnownPrefixes([], onProgress);
    return found.map((rover) => ({
      id: rover.roverId,
      name: rover.roverName,
      ip: rover.ip,
      port: rover.port,
      url: rover.url,
      responseTime: 0,
    }));
  }
  const found = await scanSubnet(prefix, onProgress);
  return found.map((rover) => ({
    id: rover.roverId,
    name: rover.roverName,
    ip: rover.ip,
    port: rover.port,
    url: rover.url,
    responseTime: 0,
  }));
}

export async function quickScanForJetsonDevices(
  onProgress?: (current: number, total: number) => void,
): Promise<JetsonDevice[]> {
  const extra: string[] = [];
  const base = await getLocalNetworkBase();
  if (base) {
    extra.push(base);
  }
  const found = await scanKnownPrefixes(extra, onProgress);
  return found.map((rover) => ({
    id: rover.roverId,
    name: rover.roverName,
    ip: rover.ip,
    port: rover.port,
    url: rover.url,
    responseTime: 0,
  }));
}

export const ALLOWED_DISCOVERY_IPS: string[] = [];
export const PRIORITY_BACKEND_IPS: string[] = [];
