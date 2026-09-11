import { isMetroBundlerUrl } from "../../config";

describe("isMetroBundlerUrl", () => {
  test("rejects Expo Metro packager URLs so they cannot be saved as rover websocket", () => {
    expect(isMetroBundlerUrl("http://192.168.137.1:8081")).toBe(true);
    expect(isMetroBundlerUrl("http://127.0.0.1:8082")).toBe(true);
    expect(isMetroBundlerUrl("192.168.137.1:8081")).toBe(true);
  });

  test("accepts rover backend URLs on port 5001", () => {
    expect(isMetroBundlerUrl("http://192.168.3.101:5001")).toBe(false);
    expect(isMetroBundlerUrl("http://192.168.1.101:5001")).toBe(false);
  });
});
