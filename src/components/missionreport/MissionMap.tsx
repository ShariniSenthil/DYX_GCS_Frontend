import { USE_NATIVE_MISSION_MAP } from "../../config/featureFlags";
import { MissionMapNative } from "./MissionMapNative";
import { MissionMapWebView } from "./MissionMap.webview";

// React.memo() returns an object, not a function. Never gate on typeof === "function".
export const MissionMap = USE_NATIVE_MISSION_MAP
  ? MissionMapNative
  : MissionMapWebView;

export default MissionMap;
