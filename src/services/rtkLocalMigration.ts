/**
 * One-release migration from tablet AsyncStorage NTRIP profiles to backend
 * RTK profiles. Local profiles are never runtime authority and are never
 * uploaded automatically.
 */

import type { NTRIPProfile } from "../types/ntrip";
import type { RtkProfile, RtkTlsMode } from "../types/rtk";
import { createRtkProfile, formatRtkApiError } from "./rtkService";
import {
  deleteProfile as deleteLocalProfile,
  getAllProfiles as getLocalProfiles,
} from "./ntripProfileStorage";

export interface RtkLocalProfileSummary {
  id: string;
  name: string;
}

export interface RtkLocalMigrationItem {
  localId: string;
  name: string;
  caster_host: string;
  caster_port: number;
  mountpoint: string;
  username: string;
  password: string;
  tls_mode: RtkTlsMode;
}

export interface RtkLocalMigrationFailure {
  localId: string;
  name: string;
  message: string;
}

export interface RtkLocalMigrationResult {
  imported: Array<{ localId: string; profile: RtkProfile }>;
  failed: RtkLocalMigrationFailure[];
  skipped: string[];
}

function parseLocalPort(port: string): number {
  const parsed = Number.parseInt(port || "2101", 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return 2101;
  }
  return parsed;
}

export function localProfileToMigrationItem(
  profile: NTRIPProfile,
  tlsMode: RtkTlsMode = "REQUIRED",
): RtkLocalMigrationItem {
  return {
    localId: profile.id,
    name: profile.name,
    caster_host: profile.casterAddress,
    caster_port: parseLocalPort(profile.port),
    mountpoint: profile.mountpoint,
    username: profile.username,
    password: profile.password,
    tls_mode: tlsMode,
  };
}

export async function listLocalRtkProfilesForMigration(): Promise<
  RtkLocalProfileSummary[]
> {
  const profiles = await getLocalProfiles();

  // Do not place legacy plaintext passwords into React/UI state merely by
  // opening the RTK control screen. Full rows are re-read only after an
  // explicit Import action.
  if (!Array.isArray(profiles)) {
    return [];
  }
  return profiles
    .filter((profile) => profile && profile.id != null)
    .map((profile) => ({
      id: profile.id,
      name: String(profile.name ?? profile.id),
    }));
}

export async function importLocalRtkProfiles(options: {
  items: RtkLocalMigrationItem[];
  tlsMode: RtkTlsMode;
  confirmDisabledTls: boolean;
}): Promise<RtkLocalMigrationResult> {
  if (options.tlsMode === "DISABLED" && !options.confirmDisabledTls) {
    throw new Error(
      "DISABLED TLS requires explicit confirmation because credentials will be sent over plaintext NTRIP.",
    );
  }

  const imported: RtkLocalMigrationResult["imported"] = [];
  const failed: RtkLocalMigrationFailure[] = [];
  const skipped: string[] = [];

  for (const item of options.items) {
    try {
      const profile = await createRtkProfile({
        name: item.name,
        caster_host: item.caster_host,
        caster_port: item.caster_port,
        mountpoint: item.mountpoint,
        username: item.username,
        password: item.password,
        tls_mode: options.tlsMode,
      });

      await deleteLocalProfile(item.localId);
      imported.push({ localId: item.localId, profile });
    } catch (error) {
      failed.push({
        localId: item.localId,
        name: item.name,
        message: formatRtkApiError(error, "Unable to import local RTK profile"),
      });
    }
  }

  return { imported, failed, skipped };
}

export async function importSelectedLocalRtkProfiles(options: {
  localIds: string[];
  tlsMode: RtkTlsMode;
  confirmDisabledTls: boolean;
}): Promise<RtkLocalMigrationResult> {
  const locals = await getLocalProfiles();
  const selected = locals.filter((profile) => options.localIds.includes(profile.id));
  return importLocalRtkProfiles({
    items: selected.map((profile) =>
      localProfileToMigrationItem(profile, options.tlsMode),
    ),
    tlsMode: options.tlsMode,
    confirmDisabledTls: options.confirmDisabledTls,
  });
}
