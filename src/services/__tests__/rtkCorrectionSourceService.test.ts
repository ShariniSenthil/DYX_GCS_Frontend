jest.mock("../../services/apiClient", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPut: jest.fn(),
  apiPatch: jest.fn(),
  apiDelete: jest.fn(),
}));

import { apiGet, apiPut } from "../../services/apiClient";
import { PX4_RTK } from "../../config/px4Endpoints";
import {
  getRtkCorrectionSource,
  listRtkSerialPorts,
  updateRtkCorrectionSource,
} from "../rtkService";
import type { RtkCorrectionSource } from "../../types/rtk";

const mockGet = apiGet as jest.MockedFunction<typeof apiGet>;
const mockPut = apiPut as jest.MockedFunction<typeof apiPut>;

const SOURCE: RtkCorrectionSource = {
  source: "LORA",
  lora_serial_device: "/dev/ttyUSB0",
  lora_serial_baud: 57600,
  lora_direct_inject: true,
  lora_direct_serial_device: "/dev/ttyACM2",
  lora_direct_serial_baud: 230400,
  revision: 3,
  updated_at: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
});

it("uses the backend source endpoints", () => {
  expect(PX4_RTK.SOURCE).toBe("/api/rtk/source");
  expect(PX4_RTK.SERIAL_PORTS).toBe("/api/rtk/serial-ports");
});

it("reads the saved correction source", async () => {
  mockGet.mockResolvedValueOnce({ correction_source: SOURCE });
  await expect(getRtkCorrectionSource()).resolves.toEqual(SOURCE);
  expect(mockGet).toHaveBeenCalledWith("/api/rtk/source");
});

it("PUTs only the fields given and returns the saved source", async () => {
  mockPut.mockResolvedValueOnce({ correction_source: SOURCE });
  const saved = await updateRtkCorrectionSource({
    source: "LORA",
    lora_serial_device: "/dev/ttyUSB0",
  });
  expect(saved).toEqual(SOURCE);
  expect(mockPut).toHaveBeenCalledWith("/api/rtk/source", {
    source: "LORA",
    lora_serial_device: "/dev/ttyUSB0",
  });
});

it("propagates a rejected switch instead of reporting success", async () => {
  mockPut.mockRejectedValueOnce(new Error("RTK is running and the new correction source cannot start"));
  await expect(updateRtkCorrectionSource({ source: "NTRIP" })).rejects.toThrow(
    "cannot start",
  );
});

it("lists serial ports and tolerates a malformed body", async () => {
  const ports = [
    { path: "/dev/ttyUSB0", device: "/dev/ttyUSB0", label: "ttyUSB0", role: "other" },
  ];
  mockGet.mockResolvedValueOnce({ ports });
  await expect(listRtkSerialPorts()).resolves.toEqual(ports);
  mockGet.mockResolvedValueOnce({});
  await expect(listRtkSerialPorts()).resolves.toEqual([]);
});
