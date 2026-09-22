import { resolveRppDebugDataState } from "../liveAccuracyState";

const liveGate = {
  connectionState: "connected",
  socketStale: false,
  missionActive: true,
};

describe("resolveRppDebugDataState", () => {
  test("LIVE only when backend reports available AND fresh", () => {
    expect(
      resolveRppDebugDataState(liveGate, {
        available: true,
        fresh: true,
        valuesPresent: true,
      }),
    ).toBe("live");
  });

  test("cached values with fresh=false are STALE, not LIVE", () => {
    expect(
      resolveRppDebugDataState(liveGate, {
        available: true,
        fresh: false,
        valuesPresent: true,
      }),
    ).toBe("stale");
  });

  test("absent freshness never becomes LIVE", () => {
    expect(
      resolveRppDebugDataState(liveGate, {
        available: true,
        fresh: undefined,
        valuesPresent: true,
      }),
    ).toBe("stale");
    expect(
      resolveRppDebugDataState(liveGate, {
        available: undefined,
        fresh: undefined,
        valuesPresent: false,
      }),
    ).toBe("waiting");
  });

  test("explicit unavailable with no values is UNAVAILABLE", () => {
    expect(
      resolveRppDebugDataState(liveGate, {
        available: false,
        fresh: false,
        valuesPresent: false,
      }),
    ).toBe("unavailable");
  });

  test("fresh stream but no numbers yet is WAITING", () => {
    expect(
      resolveRppDebugDataState(liveGate, {
        available: true,
        fresh: true,
        valuesPresent: false,
      }),
    ).toBe("waiting");
  });

  test("socket gate outranks a fresh RPP verdict", () => {
    const rpp = { available: true, fresh: true, valuesPresent: true };
    expect(
      resolveRppDebugDataState(
        { ...liveGate, connectionState: "disconnected" },
        rpp,
      ),
    ).toBe("offline");
    expect(
      resolveRppDebugDataState({ ...liveGate, socketStale: true }, rpp),
    ).toBe("stale");
    expect(
      resolveRppDebugDataState({ ...liveGate, missionActive: false }, rpp),
    ).toBe("inactive");
  });
});

describe("reconnect cannot revive cached RPP values", () => {
  // useRoverTelemetry imports native modules, so pin its contract at source
  // level: connect and disconnect both install the default snapshot before
  // any packet of the new connection, and that snapshot is never fresh.
  const source: string = require("fs").readFileSync(
    require("path").join(__dirname, "../../hooks/useRoverTelemetry.ts"),
    "utf8",
  );

  test("default snapshot reports RPP debug as not fresh", () => {
    const defaults = source.slice(
      source.indexOf("const createDefaultTelemetry"),
    );
    expect(defaults.slice(0, 4000)).toMatch(/rpp_debug_fresh:\s*false/);
  });

  test("connect and disconnect handlers reset cached telemetry", () => {
    for (const handler of ['socket.on("connect"', 'socket.on("disconnect"']) {
      const body = source.slice(source.indexOf(handler)).slice(0, 2500);
      expect(body).toContain("createDefaultTelemetry()");
      expect(body).toContain("mutableRef.current.telemetry = emptyTelemetry");
    }
  });
});

describe("resolveRppAccuracyDataState (/rpp/accuracy, live radial panel)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveRppAccuracyDataState } = require("../liveAccuracyState");

  test("LIVE only when available AND stream fresh", () => {
    expect(
      resolveRppAccuracyDataState(liveGate, {
        available: true,
        fresh: true,
        measurementPresent: true,
      }),
    ).toBe("live");
  });

  test("retained sample with fresh=false is STALE", () => {
    expect(
      resolveRppAccuracyDataState(liveGate, {
        available: true,
        fresh: false,
        measurementPresent: true,
      }),
    ).toBe("stale");
  });

  test("unknown freshness (older backend) is never LIVE", () => {
    expect(
      resolveRppAccuracyDataState(liveGate, {
        available: true,
        fresh: undefined,
        measurementPresent: true,
      }),
    ).toBe("stale");
  });

  test("unavailable stream", () => {
    expect(
      resolveRppAccuracyDataState(liveGate, {
        available: false,
        fresh: false,
        measurementPresent: false,
      }),
    ).toBe("unavailable");
  });

  test("socket gate outranks radial freshness", () => {
    expect(
      resolveRppAccuracyDataState(
        { ...liveGate, socketStale: true },
        { available: true, fresh: true, measurementPresent: true },
      ),
    ).toBe("stale");
  });
});
