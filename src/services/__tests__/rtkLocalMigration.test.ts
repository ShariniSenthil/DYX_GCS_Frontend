jest.mock("../rtkService", () => ({
  createRtkProfile: jest.fn(),
  formatRtkApiError: jest.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}));

jest.mock("../ntripProfileStorage", () => ({
  getAllProfiles: jest.fn(),
  deleteProfile: jest.fn(),
}));

import { createRtkProfile } from "../rtkService";
import { deleteProfile, getAllProfiles } from "../ntripProfileStorage";
import {
  importLocalRtkProfiles,
  importSelectedLocalRtkProfiles,
  localProfileToMigrationItem,
} from "../rtkLocalMigration";
import type { NTRIPProfile } from "../../types/ntrip";
import type { RtkProfile } from "../../types/rtk";

const mockCreate = createRtkProfile as jest.MockedFunction<typeof createRtkProfile>;
const mockGetLocal = getAllProfiles as jest.MockedFunction<typeof getAllProfiles>;
const mockDeleteLocal = deleteProfile as jest.MockedFunction<typeof deleteProfile>;

const LOCAL_A: NTRIPProfile = {
  id: "local-a",
  name: "Office",
  casterAddress: "caster.test",
  port: "2101",
  mountpoint: "MOUNT",
  username: "rover",
  password: "  keep  ",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const LOCAL_B: NTRIPProfile = {
  ...LOCAL_A,
  id: "local-b",
  name: "Field",
  password: "second",
};

const BACKEND: RtkProfile = {
  id: 11,
  name: "Office",
  caster_host: "caster.test",
  caster_port: 2101,
  mountpoint: "MOUNT",
  username: "rover",
  password_configured: true,
  rtcm_topic: "/mavros/gps_rtk/send_rtcm",
  connect_timeout_sec: 10,
  socket_timeout_sec: 1,
  healthy_age_sec: 5,
  stale_reconnect_sec: 10,
  reconnect_delay_sec: 5,
  first_data_timeout_sec: 10,
  gga_enabled: false,
  gga_interval_sec: 10,
  gga_max_age_sec: 5,
  tls_mode: "REQUIRED",
  max_mavros_rtcm_frame_bytes: 720,
  enabled: true,
  revision: 1,
  created_at_epoch: 1,
  updated_at_epoch: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLocal.mockResolvedValue([LOCAL_A, LOCAL_B]);
  mockDeleteLocal.mockResolvedValue(true);
  mockCreate.mockResolvedValue(BACKEND);
});

describe("local RTK profile migration", () => {
  it("imports successfully, defaults TLS to REQUIRED, preserves password whitespace, and does not start RTK", async () => {
    const result = await importLocalRtkProfiles({
      items: [localProfileToMigrationItem(LOCAL_A)],
      tlsMode: "REQUIRED",
      confirmDisabledTls: false,
    });

    expect(result.imported).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        password: "  keep  ",
        tls_mode: "REQUIRED",
      }),
    );
    expect(mockDeleteLocal).toHaveBeenCalledWith("local-a");
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("start");
  });

  it("keeps failed local profiles for retry and supports partial success", async () => {
    mockCreate
      .mockResolvedValueOnce(BACKEND)
      .mockRejectedValueOnce(new Error("name already exists"));

    const result = await importLocalRtkProfiles({
      items: [
        localProfileToMigrationItem(LOCAL_A),
        localProfileToMigrationItem(LOCAL_B),
      ],
      tlsMode: "REQUIRED",
      confirmDisabledTls: false,
    });

    expect(result.imported.map((item) => item.localId)).toEqual(["local-a"]);
    expect(result.failed.map((item) => item.localId)).toEqual(["local-b"]);
    expect(mockDeleteLocal).toHaveBeenCalledWith("local-a");
    expect(mockDeleteLocal).not.toHaveBeenCalledWith("local-b");
  });

  it("retries a previously failed local profile", async () => {
    mockCreate.mockRejectedValueOnce(new Error("offline"));
    const first = await importSelectedLocalRtkProfiles({
      localIds: ["local-b"],
      tlsMode: "REQUIRED",
      confirmDisabledTls: false,
    });
    expect(first.failed).toHaveLength(1);
    expect(mockDeleteLocal).not.toHaveBeenCalled();

    mockCreate.mockResolvedValueOnce({ ...BACKEND, id: 12, name: "Field" });
    const second = await importSelectedLocalRtkProfiles({
      localIds: ["local-b"],
      tlsMode: "REQUIRED",
      confirmDisabledTls: false,
    });
    expect(second.imported).toHaveLength(1);
    expect(mockDeleteLocal).toHaveBeenCalledWith("local-b");
  });

  it("requires explicit confirmation for DISABLED TLS", async () => {
    await expect(
      importLocalRtkProfiles({
        items: [localProfileToMigrationItem(LOCAL_A, "DISABLED")],
        tlsMode: "DISABLED",
        confirmDisabledTls: false,
      }),
    ).rejects.toThrow(/plaintext NTRIP/);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockDeleteLocal).not.toHaveBeenCalled();
  });

  it("imports DISABLED TLS only after confirmation and still does not auto-start", async () => {
    await importLocalRtkProfiles({
      items: [localProfileToMigrationItem(LOCAL_A, "DISABLED")],
      tlsMode: "DISABLED",
      confirmDisabledTls: true,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ tls_mode: "DISABLED" }),
    );
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("desired_state");
  });
});
