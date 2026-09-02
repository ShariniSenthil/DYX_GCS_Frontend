/**
 * Rover Discovery Screen
 * Full-screen discovery page shown on app launch.
 * Listens for UDP beacon broadcasts and presents rover list.
 * Landscape-optimized split layout for tablet.
 * UI ported from NewS/RoverDiscovery web design.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getLocalNetworkBase,
  JetsonDevice,
  quickScanForJetsonDevices,
} from "../utils/jetsonDiscovery";
import {
  markSessionSkipped,
  rememberRover,
  saveBackendURL,
} from "../utils/backendStorage";
import beaconListener, {
  BEACON_STALE_MS,
  DiscoveredRover,
} from "../services/beaconListener";
import {
  HEALTH_INTERVAL_MS,
  applyHealthResult,
  refreshAllHealth,
  restoreKnownRovers,
} from "../services/roverPresence";
import { setBackendURL } from "../config";
import { useAuth } from "../hooks/useAuth";
import { AUTH_ENABLED } from "../config/featureFlags";
import ConnectPasswordModal from "../components/common/ConnectPasswordModal";
import { apiProbe } from "../services/apiClient";

interface RoverDiscoveryScreenProps {
  onRoverSelected: (device: JetsonDevice) => void | Promise<void>;
}

interface PendingConnect {
  device: JetsonDevice;
  roverId?: string;
  accentColor: string;
}

export default function RoverDiscoveryScreen({
  onRoverSelected,
}: RoverDiscoveryScreenProps) {
  const { login } = useAuth();
  const [discoveredRovers, setDiscoveredRovers] = useState<DiscoveredRover[]>(
    [],
  );
  const [networkDevices, setNetworkDevices] = useState<JetsonDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualUrl, setManualUrl] = useState("http://");
  const [testingManualUrl, setTestingManualUrl] = useState(false);
  const [connectingRoverId, setConnectingRoverId] = useState<string | null>(
    null,
  );
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingConnect, setPendingConnect] = useState<PendingConnect | null>(
    null,
  );
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Animations
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  // Rotating dashed circle spinner
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  // Radar pulse ring
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 2.5,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  // Scan line animation
  useEffect(() => {
    Animated.loop(
      Animated.timing(scanLineAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  // UDP hint + HTTP presence. Do not wipe the list when UDP is quiet.
  useEffect(() => {
    let cancelled = false;

    beaconListener.start((rovers) => {
      if (!cancelled) {
        setDiscoveredRovers(rovers);
      }
      for (const rover of rovers) {
        const lastHttp = rover.lastHttpSeen ?? 0;
        if (Date.now() - lastHttp > HEALTH_INTERVAL_MS) {
          void applyHealthResult(rover);
        }
      }
    });

    const bootstrap = async () => {
      await restoreKnownRovers();
      if (cancelled) {
        return;
      }
      setDiscoveredRovers(beaconListener.getDiscoveredRovers());
      const online = beaconListener
        .getDiscoveredRovers()
        .some((rover) => rover.online);
      if (!online) {
        await runNetworkScan();
      }
    };

    void bootstrap();

    const healthTimer = setInterval(() => {
      void refreshAllHealth();
    }, HEALTH_INTERVAL_MS);
    const dotTimer = setInterval(() => setNow(Date.now()), 2000);

    return () => {
      cancelled = true;
      clearInterval(healthTimer);
      clearInterval(dotTimer);
      beaconListener.stop();
    };
  }, []);

  const handleRefresh = () => {
    setNetworkDevices([]);
    void refreshAllHealth();
    void runNetworkScan();
  };

  const runNetworkScan = async () => {
    setScanning(true);
    try {
      const prefix = await getLocalNetworkBase();
      const found = await quickScanForJetsonDevices();
      setDiscoveredRovers(beaconListener.getDiscoveredRovers());
      if (found.length === 0 && beaconListener.getDiscoveredRovers().length === 0) {
        Alert.alert(
          "No Rovers Found",
          `No rover answered GET /api/health on ${prefix}.x:5001. Try manual URL or wait for a UDP beacon.`,
        );
      }
    } catch {
      Alert.alert(
        "Scan Error",
        "Failed to scan network. Check WiFi connection.",
      );
    } finally {
      setScanning(false);
    }
  };

  const roverToDevice = (rover: DiscoveredRover): JetsonDevice => ({
    id: rover.roverId,
    name: rover.roverName,
    ip: rover.ip,
    port: rover.port,
    url: rover.url,
    responseTime: 0,
  });

  const openPasswordModal = (
    device: JetsonDevice,
    accentColor: string,
    roverId?: string,
  ) => {
    setConnectError(null);
    setPendingConnect({ device, roverId, accentColor });
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPendingConnect(null);
    setConnectError(null);
    setConnectingRoverId(null);
  };

  const finishConnect = async (
    device: JetsonDevice,
    username: string,
    password: string,
  ): Promise<void> => {
    setConnectingRoverId(device.id);
    setIsConnecting(true);
    setConnectError(null);

    try {
      /*
       * The API must use the selected rover URL before sending login.
       *
       * Do not save the URL yet. A wrong password or unreachable backend
       * must not become the permanently selected rover.
       */
      setBackendURL(device.url);

      if (AUTH_ENABLED) {
        await login(username, password);
      }

      /*
       * App.tsx saves the backend URL only after authentication succeeds.
       */
      await rememberRover({
        roverId: device.id,
        roverName: device.name,
        ip: device.ip,
        port: device.port,
      });
      await onRoverSelected(device);

      setShowPasswordModal(false);
      setPendingConnect(null);
      setConnectError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      const normalizedMessage = message.toLowerCase();

      const invalidCredentials =
        normalizedMessage.includes("401") ||
        normalizedMessage.includes("invalid_password") ||
        normalizedMessage.includes("invalid") ||
        normalizedMessage.includes("unauthorized");

      setConnectError(
        invalidCredentials
          ? "Incorrect username or password. Please try again."
          : `Connection failed: ${message}`,
      );
    } finally {
      setConnectingRoverId(null);
      setIsConnecting(false);
    }
  };

  const handleSelectBeaconRover = (rover: DiscoveredRover) => {
    const device = roverToDevice(rover);
    if (AUTH_ENABLED) {
      openPasswordModal(device, "#4ade80", rover.roverId);
      return;
    }
    void finishConnect(device, "", "");
  };

  const handleSelectNetworkDevice = (device: JetsonDevice) => {
    if (AUTH_ENABLED) {
      openPasswordModal(device, "#3b82f6");
      return;
    }
    void finishConnect(device, "", "");
  };

  const handleConnect = async (username: string, password: string) => {
    if (!pendingConnect) {
      return;
    }

    await finishConnect(pendingConnect.device, username, password);
  };

  const handleConnectManualUrl = async () => {
    if (!manualUrl || manualUrl === "http://") {
      Alert.alert("Invalid URL", "Please enter a valid backend URL");
      return;
    }
    setTestingManualUrl(true);
    try {
      // Accept both `192.168.3.101:5001` and a complete URL.
      const normalizedManualUrl = /^https?:\/\//i.test(manualUrl.trim())
        ? manualUrl.trim().replace(/\/+$/, "")
        : `http://${manualUrl.trim().replace(/\/+$/, "")}`;
      const urlObj = new URL(normalizedManualUrl);
      const ip = urlObj.hostname;
      const port = urlObj.port ? parseInt(urlObj.port) : 5001;
      let reachable = false;
      for (const probePath of ["/api/health", "/api/healthz", "/api/ping"]) {
        try {
          const r = await apiProbe(`${normalizedManualUrl}${probePath}`, {
            timeoutMs: 5000,
          });
          if (r.status < 500) {
            reachable = true;
            break;
          }
        } catch {
          /* try next */
        }
      }
      const response = { status: reachable ? 200 : 503 };
      if (reachable) {
        const device: JetsonDevice = {
          id: "custom-" + ip,
          name: `Custom Rover (${ip})`,
          ip,
          port,
          url: normalizedManualUrl,
          responseTime: 0,
        };
        setShowManualInput(false);
        if (AUTH_ENABLED) {
          openPasswordModal(device, "#f59e0b");
          return;
        }
        setBackendURL(normalizedManualUrl);
        await saveBackendURL(normalizedManualUrl, ip, port);
        onRoverSelected(device);
      } else {
        Alert.alert(
          "Connection Failed",
          `Server responded with status ${response.status}`,
        );
      }
    } catch (error: any) {
      let msg = "Could not reach the server.\n\n";
      if (error.message?.includes("Invalid URL")) {
        msg += "Invalid URL format. Use: http://IP:PORT";
      } else if (error.code === "ECONNREFUSED") {
        msg += "Connection refused. Check backend is running.";
      } else if (
        error.code === "ETIMEDOUT" ||
        error.message?.includes("timeout")
      ) {
        msg += "Timeout. Check IP address and network.";
      } else {
        msg += error.message || "Unknown error";
      }
      Alert.alert("Connection Error", msg);
    } finally {
      setTestingManualUrl(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      "Continue Offline",
      "Some features will be limited without a rover connection.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue Offline",
          onPress: async () => {
            const offline: JetsonDevice = {
              id: "offline",
              name: "Offline Mode",
              ip: "localhost",
              port: 8000,
              url: "http://localhost:8000",
              responseTime: 0,
            };
            await saveBackendURL(offline.url, offline.ip, offline.port);
            await markSessionSkipped();
            onRoverSelected(offline);
          },
        },
      ],
    );
  };

  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const pulseScale = pulseAnim;
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [1, 2.5],
    outputRange: [0.3, 0],
  });

  const allRovers = discoveredRovers;
  const hasBeacons = allRovers.length > 0;
  const hasNetwork = networkDevices.length > 0;
  const totalCount = allRovers.length + networkDevices.length;

  // ── LEFT PANEL (Sidebar) ─────────────────────────────────────────────────
  const renderLeftPanel = () => (
    <View style={styles.sidebar}>
      {/* Branding */}
      <View style={styles.brandingSection}>
        <View style={styles.logoBox}>
          <Ionicons name="radio" size={28} color="#4ade80" />
        </View>
        <Text style={styles.appTitle}>DYX GCS</Text>
        <Text style={styles.appSubtitle}>Ground Control Station</Text>
      </View>

      {/* Status & Telemetry */}
      <View style={styles.sidebarContent}>
        {/* System Active Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusCardHeader}>
            <View style={styles.statusDotWrap}>
              <View style={styles.statusDotGreen} />
            </View>
            <Text style={styles.systemActiveText}>System Active</Text>
          </View>
          <View style={styles.statusInfoRow}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={styles.statusValue}>
              {beaconListener.isAvailable
                ? "Listening for beacons..."
                : "Web mode"}
            </Text>
          </View>
          <View style={styles.statusInfoRow}>
            <Text style={styles.statusLabel}>Beacon UDP</Text>
            <Text style={styles.udpPortValue}>5002</Text>
          </View>
          <View style={styles.statusInfoRow}>
            <Text style={styles.statusLabel}>API Port</Text>
            <Text style={styles.udpPortValue}>5001</Text>
          </View>
        </View>

        {/* Telemetry Section */}
        <View style={styles.telemetrySection}>
          <Text style={styles.telemetrySectionTitle}>Telemetry</Text>
          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryBox}>
              <Ionicons name="pulse" size={12} color="#60a5fa" />
              <Text style={styles.telemetryValue}>{totalCount}</Text>
              <Text style={styles.telemetryLabel}>Active Rovers</Text>
            </View>
            <View style={styles.telemetryBox}>
              <Ionicons name="cellular" size={12} color="#fb923c" />
              <Text style={styles.telemetryValue}>
                {totalCount > 0 ? "Good" : "--"}
              </Text>
              <Text style={styles.telemetryLabel}>Signal Strength</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtonsWrap}>
        <TouchableOpacity
          style={styles.btnGreen}
          onPress={handleRefresh}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={14} color="#000" />
          <Text style={styles.btnGreenText}>REFRESH</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnBlue}
          onPress={runNetworkScan}
          disabled={scanning}
          activeOpacity={0.8}
        >
          {scanning ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="search" size={14} color="white" />
          )}
          <Text style={styles.btnBlueText}>
            {scanning ? "SCANNING..." : "NETWORK SCAN"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnOrange}
          onPress={() => setShowManualInput(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="link" size={14} color="white" />
          <Text style={styles.btnOrangeText}>MANUAL URL</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnSkip}
          onPress={handleSkip}
          activeOpacity={0.6}
        >
          <Text style={styles.btnSkipText}>Continue Offline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── ROVER CARDS ──────────────────────────────────────────────────────────
  const isRoverPending = (id: string): boolean =>
    showPasswordModal && pendingConnect?.device.id === id;

  const renderRoverCard = (rover: DiscoveredRover) => {
    const beaconStale =
      rover.lastBeaconSeen === 0 || now - rover.lastBeaconSeen > BEACON_STALE_MS;
    const isStale = !rover.online;
    const dotColor = rover.online ? "#4ade80" : "#fb923c";
    const isConnectingThis = connectingRoverId === rover.roverId;
    const isPending = isRoverPending(rover.roverId);

    return (
      <TouchableOpacity
        key={rover.roverId}
        style={[styles.roverCard, isPending && styles.roverCardSelected]}
        onPress={() => handleSelectBeaconRover(rover)}
        disabled={isConnectingThis || isConnecting}
        activeOpacity={0.75}
      >
        <View style={[styles.cardAccent, { backgroundColor: dotColor }]} />
        <View style={[styles.cardIconWrap, { borderColor: dotColor + "40" }]}>
          <Ionicons name="hardware-chip" size={28} color={dotColor} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={styles.cardName}>{rover.roverName}</Text>
            <View
              style={[
                styles.cardBadge,
                { backgroundColor: dotColor + "22", borderColor: dotColor },
              ]}
            >
              <View style={[styles.badgeDot, { backgroundColor: dotColor }]} />
              <Text style={[styles.cardBadgeText, { color: dotColor }]}>
                {rover.online ? "ONLINE" : "OFFLINE"}
              </Text>
            </View>
          </View>
          <Text style={styles.cardId}>{rover.roverId}</Text>
          <View style={styles.cardMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="globe-outline" size={11} color="#4ade80" />
              <Text style={styles.metaTextGreen}>
                {rover.ip}:{rover.port}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={11} color="#666" />
              <Text style={styles.metaTextGray}>
                Up {formatUptime(rover.uptime)}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="code-slash-outline" size={11} color="#666" />
              <Text style={styles.metaTextGray}>v{rover.version}</Text>
            </View>
          </View>
        </View>
        <View style={styles.cardArrow}>
          {isConnectingThis ? (
            <ActivityIndicator size="small" color="#4ade80" />
          ) : (
            <>
              <Text style={styles.connectLabel}>CONNECT</Text>
              <Ionicons name="chevron-forward" size={18} color="#4ade80" />
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderNetworkCard = (device: JetsonDevice) => {
    const isConnectingThis = connectingRoverId === device.id;
    const isPending = isRoverPending(device.id);
    return (
      <TouchableOpacity
        key={device.id}
        style={[styles.roverCard, isPending && styles.roverCardSelected]}
        onPress={() => handleSelectNetworkDevice(device)}
        disabled={isConnectingThis || isConnecting}
        activeOpacity={0.75}
      >
        <View style={[styles.cardAccent, { backgroundColor: "#3b82f6" }]} />
        <View style={[styles.cardIconWrap, { borderColor: "#3b82f640" }]}>
          <Ionicons name="wifi" size={28} color="#3b82f6" />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={styles.cardName}>{device.name}</Text>
            <View
              style={[
                styles.cardBadge,
                { backgroundColor: "#3b82f622", borderColor: "#3b82f6" },
              ]}
            >
              <Text style={[styles.cardBadgeText, { color: "#3b82f6" }]}>
                SCAN
              </Text>
            </View>
          </View>
          <View style={styles.cardMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="globe-outline" size={11} color="#3b82f6" />
              <Text style={[styles.metaTextGreen, { color: "#3b82f6" }]}>
                {device.ip}:{device.port}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="speedometer-outline" size={11} color="#666" />
              <Text style={styles.metaTextGray}>{device.responseTime}ms</Text>
            </View>
          </View>
        </View>
        <View style={styles.cardArrow}>
          {isConnectingThis ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <>
              <Text style={[styles.connectLabel, { color: "#3b82f6" }]}>
                CONNECT
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#3b82f6" />
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── MAIN CONTENT (Right Panel) ───────────────────────────────────────────
  const renderMainContent = () => (
    <View style={styles.mainContent}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <View style={styles.headerStatusDot} />
          <Text style={styles.headerScanText}>
            {totalCount > 0 ? "CONNECTED" : "SCANNING..."}
          </Text>
          <View style={styles.headerDivider} />
          <Text style={styles.headerCoords}>LAT: 0.000000 | LNG: 0.000000</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.6}>
            <Ionicons
              name="settings-outline"
              size={16}
              color="rgba(255,255,255,0.4)"
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.6}>
            <Ionicons
              name="hardware-chip-outline"
              size={16}
              color="rgba(255,255,255,0.4)"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Viewport Area */}
      <View style={styles.viewport}>
        {/* Decorative Corner Elements */}
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />

        {/* Scan Line */}
        <Animated.View
          style={[
            styles.scanLine,
            {
              transform: [
                {
                  translateY: scanLineAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-600, 600],
                  }),
                },
              ],
            },
          ]}
        />

        {/* Rover List or Empty State */}
        {hasBeacons || hasNetwork ? (
          <View style={styles.roverListArea}>
            {hasBeacons && (
              <>
                {networkDevices.length > 0 && (
                  <Text style={styles.sectionLabel}>BEACON DISCOVERY</Text>
                )}
                {allRovers.map(renderRoverCard)}
              </>
            )}
            {hasNetwork && (
              <>
                <Text style={styles.sectionLabel}>NETWORK SCAN</Text>
                {networkDevices.map(renderNetworkCard)}
              </>
            )}
            {scanning && (
              <View style={styles.scanningRow}>
                <ActivityIndicator size="small" color="#3b82f6" />
                <Text style={styles.scanningText}>
                  Scanning network for rovers...
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            {/* Animated Spinner */}
            <View style={styles.spinnerWrap}>
              <Animated.View
                style={[
                  styles.spinnerOuter,
                  { transform: [{ rotate: spinRotation }] },
                ]}
              >
                <View style={styles.spinnerInner}>
                  <ActivityIndicator size="large" color="#4ade80" />
                </View>
              </Animated.View>
              {/* Radar Pulse */}
              <Animated.View
                style={[
                  styles.radarPulse,
                  {
                    transform: [{ scale: pulseScale }],
                    opacity: pulseOpacity,
                  },
                ]}
              />
            </View>

            <Text style={styles.emptyTitle}>Waiting for rovers...</Text>
            <Text style={styles.emptyDesc}>
              Ensure the rover is powered on and connected to the same network.
              {"\n"}
              The system is currently listening for broadcast beacons.
            </Text>

            {/* Tips Card */}
            <View style={styles.tipsCard}>
              <View style={styles.tipRow}>
                <View style={styles.tipDotWrap}>
                  <View style={styles.tipDot} />
                </View>
                <Text style={styles.tipText}>
                  Beacon on{" "}
                  <Text style={styles.tipHighlightGreen}>UDP 5002</Text>
                  {" · "}API on{" "}
                  <Text style={styles.tipHighlightGreen}>HTTP 5001</Text>
                </Text>
              </View>
              <View style={styles.tipRow}>
                <View style={styles.tipDotWrap}>
                  <View style={styles.tipDot} />
                </View>
                <Text style={styles.tipText}>
                  Beacon interval:{" "}
                  <Text style={styles.tipHighlightWhite}>every 2 seconds</Text>
                </Text>
              </View>
              <View style={styles.tipRow}>
                <View style={styles.tipDotWrap}>
                  <View style={styles.tipDot} />
                </View>
                <Text style={styles.tipText}>
                  Use <Text style={styles.tipHighlightBlue}>Network Scan</Text>{" "}
                  or <Text style={styles.tipHighlightOrange}>Manual URL</Text>{" "}
                  as fallback
                </Text>
              </View>
            </View>

            {scanning && (
              <View style={[styles.scanningRow, { marginTop: 16 }]}>
                <ActivityIndicator size="small" color="#3b82f6" />
                <Text style={styles.scanningText}>Scanning network...</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Footer Bar */}
      <View style={styles.footerBar}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerText}>CPU: 1/8</Text>
          <Text style={styles.footerText}>MEM: 256MB</Text>
          <Text style={styles.footerText}>NET: 0.5 KB/S</Text>
        </View>
        <View style={styles.footerRight}>
          <Text style={styles.footerTextGreen}>ENCRYPTION: AES-256</Text>
          <Text style={styles.footerText}>v2.4.0-STABLE</Text>
        </View>
      </View>
    </View>
  );

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {renderLeftPanel()}
      {renderMainContent()}

      <ConnectPasswordModal
        visible={showPasswordModal && pendingConnect !== null}
        roverName={pendingConnect?.device.name ?? ""}
        roverId={pendingConnect?.roverId}
        host={`${pendingConnect?.device.ip ?? ""}:${pendingConnect?.device.port ?? 5001}`}
        accentColor={pendingConnect?.accentColor ?? "#4ade80"}
        isConnecting={isConnecting}
        error={connectError}
        onClose={closePasswordModal}
        onConnect={handleConnect}
      />

      {/* Manual URL Modal */}
      <Modal
        visible={showManualInput}
        transparent
        animationType="fade"
        onRequestClose={() => setShowManualInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="link" size={22} color="#fb923c" />
              <Text style={styles.modalTitle}>Manual Backend URL</Text>
            </View>
            <Text style={styles.modalHint}>
              Probes /api/healthz (4WD_SERVER){"\n"}Example:
              http://192.168.1.101:5001
            </Text>
            <TextInput
              style={styles.urlInput}
              placeholder="http://192.168.1.x:5001"
              placeholderTextColor="#555"
              value={manualUrl}
              onChangeText={setManualUrl}
              editable={!testingManualUrl}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowManualInput(false)}
                disabled={testingManualUrl}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConnect]}
                onPress={handleConnectManualUrl}
                disabled={testingManualUrl}
              >
                {testingManualUrl ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalBtnText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STYLES — ported from NewS/RoverDiscovery Tailwind → React Native
// ════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#0a0a0b",
  },

  // ── SIDEBAR ─────────────────────────────────────────────────────────────
  sidebar: {
    width: 288,
    backgroundColor: "#0d0d0f",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.05)",
    flexDirection: "column",
  },
  brandingSection: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(74,222,128,0.1)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 4,
  },
  appSubtitle: {
    fontSize: 9,
    color: "rgba(74,222,128,0.6)",
    letterSpacing: 3,
    textTransform: "uppercase",
    fontWeight: "500",
    marginTop: 4,
  },

  // Status Card
  sidebarContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  statusCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    marginBottom: 16,
  },
  statusCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  statusDotWrap: {
    position: "relative",
  },
  statusDotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ade80",
  },
  systemActiveText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4ade80",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  statusInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  statusLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
  statusValue: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
  },
  udpPortValue: {
    fontSize: 11,
    color: "#4ade80",
    fontVariant: ["tabular-nums"],
  },

  // Telemetry
  telemetrySection: {
    marginBottom: 12,
  },
  telemetrySectionTitle: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 3,
    color: "rgba(255,255,255,0.3)",
    fontWeight: "700",
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  telemetryGrid: {
    flexDirection: "row",
    gap: 8,
  },
  telemetryBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  telemetryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    fontVariant: ["tabular-nums"],
    marginTop: 4,
  },
  telemetryLabel: {
    fontSize: 8,
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase",
    marginTop: 2,
  },

  // Action Buttons
  actionButtonsWrap: {
    padding: 24,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  btnGreen: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4ade80",
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnGreenText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  btnBlue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnBlueText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  btnOrange: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f59e0b",
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnOrangeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  btnSkip: {
    alignItems: "center",
    paddingVertical: 8,
  },
  btnSkipText: {
    fontSize: 9,
    color: "rgba(255,255,255,0.2)",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 3,
  },

  // ── MAIN CONTENT ────────────────────────────────────────────────────────
  mainContent: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#0a0a0b",
  },

  // Header Bar
  headerBar: {
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    backgroundColor: "rgba(13,13,15,0.5)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ade80",
  },
  headerScanText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    color: "rgba(255,255,255,0.8)",
    textTransform: "uppercase",
  },
  headerDivider: {
    width: 1,
    height: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  headerCoords: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    fontVariant: ["tabular-nums"],
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    padding: 8,
    borderRadius: 8,
  },

  // Viewport
  viewport: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  scanLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(74,222,128,0.3)",
    zIndex: 1,
  },

  // Corner decorations
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    zIndex: 2,
  },
  cornerTL: {
    top: 24,
    left: 24,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 24,
    right: 24,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 24,
    left: 24,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 24,
    right: 24,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    borderBottomRightRadius: 8,
  },

  // Rover list area
  roverListArea: {
    flex: 1,
    paddingHorizontal: 28,
    paddingVertical: 20,
  },
  sectionLabel: {
    fontSize: 9,
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 2,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 4,
  },

  // Rover Card
  roverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  roverCardSelected: {
    borderColor: "rgba(74,222,128,0.5)",
    backgroundColor: "rgba(74,222,128,0.08)",
  },
  cardAccent: {
    width: 3,
    alignSelf: "stretch",
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 14,
  },
  cardBody: {
    flex: 1,
    paddingVertical: 14,
    gap: 3,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  cardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  cardBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cardId: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
  },
  cardMeta: {
    flexDirection: "row",
    gap: 14,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaTextGreen: {
    fontSize: 11,
    color: "#4ade80",
    fontWeight: "500",
  },
  metaTextGray: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
  },
  cardArrow: {
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 2,
  },
  connectLabel: {
    fontSize: 8,
    color: "#4ade80",
    letterSpacing: 1,
    fontWeight: "700",
  },

  // Scanning row
  scanningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  scanningText: {
    fontSize: 13,
    color: "#3b82f6",
    fontWeight: "500",
  },

  // ── EMPTY STATE ─────────────────────────────────────────────────────────
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  spinnerWrap: {
    width: 128,
    height: 128,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 28,
  },
  spinnerOuter: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
    borderColor: "rgba(74,222,128,0.2)",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  spinnerInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  radarPulse: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 1,
    borderColor: "#4ade80",
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  tipsCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    width: "100%",
    maxWidth: 420,
    gap: 12,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tipDotWrap: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(74,222,128,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ade80",
  },
  tipText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
  },
  tipHighlightGreen: {
    color: "#4ade80",
    fontVariant: ["tabular-nums"],
  },
  tipHighlightWhite: {
    color: "#ffffff",
    fontWeight: "500",
  },
  tipHighlightBlue: {
    color: "#60a5fa",
    fontWeight: "500",
  },
  tipHighlightOrange: {
    color: "#fb923c",
    fontWeight: "500",
  },

  // ── FOOTER BAR ──────────────────────────────────────────────────────────
  footerBar: {
    height: 44,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    backgroundColor: "rgba(13,13,15,0.5)",
  },
  footerLeft: {
    flexDirection: "row",
    gap: 20,
  },
  footerRight: {
    flexDirection: "row",
    gap: 16,
  },
  footerText: {
    fontSize: 9,
    color: "rgba(255,255,255,0.2)",
    fontVariant: ["tabular-nums"],
  },
  footerTextGreen: {
    fontSize: 9,
    color: "rgba(74,222,128,0.5)",
    fontVariant: ["tabular-nums"],
  },

  // ── MODAL ───────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: "#151619",
    borderRadius: 16,
    padding: 28,
    width: 420,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
  },
  modalHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 18,
    lineHeight: 20,
  },
  urlInput: {
    backgroundColor: "#0a0a0b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 14,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalBtnCancel: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  modalBtnConnect: {
    backgroundColor: "#f59e0b",
  },
  modalBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
