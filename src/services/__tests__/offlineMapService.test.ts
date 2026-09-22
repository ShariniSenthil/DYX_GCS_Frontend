jest.mock("@rnmapbox/maps", () => ({
  offlineManager: {
    getPacks: jest.fn(),
    createPack: jest.fn(),
    deletePack: jest.fn(),
    subscribe: jest.fn(),
  },
}));

import { deriveOfflineMapRegion } from "../offlineMapService";

describe("deriveOfflineMapRegion", () => {
  it("uses a bounded, buffered mission area when mission points are available", () => {
    const region = deriveOfflineMapRegion(
      [
        { lat: 13.0827, lon: 80.2707 },
        { lat: 13.084, lon: 80.273 },
      ],
      { lat: 13.08, lon: 80.27 },
    );

    expect(region?.source).toBe("mission");
    expect(region?.bounds.sw[0]).toBeLessThanOrEqual(80.2707);
    expect(region?.bounds.sw[1]).toBeLessThanOrEqual(13.0827);
    expect(region?.bounds.ne[0]).toBeGreaterThanOrEqual(80.273);
    expect(region?.bounds.ne[1]).toBeGreaterThanOrEqual(13.084);
  });

  it("falls back to a rover-sized area instead of auto-downloading a huge mission", () => {
    const region = deriveOfflineMapRegion(
      [
        { lat: 13, lon: 80 },
        { lat: 13.2, lon: 80.2 },
      ],
      { lat: 13.08, lon: 80.27 },
    );

    expect(region?.source).toBe("rover");
    expect(region?.bounds.sw[0]).toBeLessThan(80.27);
    expect(region?.bounds.ne[0]).toBeGreaterThan(80.27);
  });

  it("waits when no valid mission or rover location exists", () => {
    expect(
      deriveOfflineMapRegion([{ lat: 0, lon: 0 }], null),
    ).toBeNull();
  });
});
