import React, { useMemo, useRef, useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import {
  MAPBOX_ACCESS_TOKEN,
  MAPBOX_JS_URL,
  MAPBOX_CSS_URL,
  MAPBOX_STYLE_SATELLITE,
  MAPBOX_STYLE_STREETS,
  MAPBOX_STYLE_DARK,
} from "../../config/mapboxConfig";
import { MapBottomControlsBar } from "../shared/MapBottomControlsBar";
import type { Waypoint } from "./types";
import type { LoadedPathPoint } from "../../services/missionApi";

interface Props {
  roverLat?: number;
  roverLon?: number;
  waypoints?: Waypoint[];

  /**
   * Generated backend trajectory.
   *
   * latitude/longitude are authoritative for map display and are produced
   * by rover_backend from PX4 gp_origin using the exact inverse PX4
   * MapProjection. Local x/y may still be present for diagnostics.
   */
  trajectoryPoints?: LoadedPathPoint[];

  heading?: number | null;
  activeWaypointIndex?: number | null;

  armed?: boolean;
  rtkFixType?: number;

  /** Full-screen map without rounded corners. */
  edgeToEdge?: boolean;

  /** Pauses Mapbox activity while the tab is hidden. */
  isVisible?: boolean;

  statusMap?: Record<
    number,
    {
      status?: string;
    } & Record<string, any>
  >;
}

const MissionMapBase: React.FC<Props> = ({
  roverLat = 0,
  roverLon = 0,
  waypoints = [],
  trajectoryPoints = [],
  heading = null,
  activeWaypointIndex = null,
  armed = false,
  rtkFixType = 0,
  edgeToEdge = false,
  isVisible = true,
  statusMap,
}) => {
  const webViewRef = useRef<WebView | null>(null);

  const [mapReady, setMapReady] = useState(false);

  const [mapStyle, setMapStyle] = useState<"satellite" | "streets" | "dark">(
    "satellite",
  );

  const mapInitializedRef = useRef(false);

  // Ref so waypoints injection reads latest active index without re-triggering a full reload
  const activeWaypointIndexRef = useRef(activeWaypointIndex);
  useEffect(() => {
    activeWaypointIndexRef.current = activeWaypointIndex;
  }, [activeWaypointIndex]);

  // Store initial rover data for one-time HTML generation
  const initialRoverData = useRef({
    lat: roverLat,
    lon: roverLon,
    heading: heading,
    hasPosition: Number.isFinite(roverLat) && Number.isFinite(roverLon),
  });

  // Generate HTML with Mapbox map - ONLY ONCE on mount
  // WAYPOINTS DEFERRED: HTML shell has empty waypoints; data injected after WebView loads.
  // This avoids blocking the JS thread with JSON.stringify on 400+ waypoints during render.
  const mapHTML = useMemo(() => {
    console.log(
      "[MissionMap] Generating map HTML shell (waypoints deferred to injectedJavaScript)",
    );

    const roverData = JSON.stringify(initialRoverData.current);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel='stylesheet' href='${MAPBOX_CSS_URL}' />
  <script src='${MAPBOX_JS_URL}'></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }

    .mapboxgl-ctrl-attrib, .mapboxgl-ctrl-logo { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>

  <script>
    mapboxgl.accessToken = '${MAPBOX_ACCESS_TOKEN}';

    // Waypoints loaded AFTER WebView init via injectedJavaScript
    // This avoids blocking JS thread with JSON.stringify on 400+ waypoints during HTML generation
    const waypoints = [];
    const roverData = ${roverData};

    // Initialize map
    const centerLat = waypoints.length > 0 ? waypoints[0].lat : (roverData.hasPosition ? roverData.lat : 13.0827);
    const centerLon = waypoints.length > 0 ? waypoints[0].lon : (roverData.hasPosition ? roverData.lon : 80.2707);

    const map = new mapboxgl.Map({
      container: 'map',
      style: '${MAPBOX_STYLE_SATELLITE}',
      center: [centerLon, centerLat],
      zoom: 15,
      maxZoom: 26,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });

    let roverMarker = null;

    let generatedTrajectoryData = {
      type: 'FeatureCollection',
      features: []
    };

    // Live rover position — updated via injected JS so centerOnRover always uses current coords
    let liveRoverPos = roverData.hasPosition ? { lat: roverData.lat, lon: roverData.lon } : null;

    // WEB APP STYLE: Custom RoverMarker wrapper for Mapbox
    class RoverMarker {
      constructor(lngLat, options) {
        this._heading = options?.heading || 0;
        this._status = options?.status || 'disarmed';
        this._el = document.createElement('div');
        this._el.style.cssText = 'width:84px;height:84px;display:flex;align-items:center;justify-content:center;';
        this._el.innerHTML = options?.iconSVG || '';
        this._marker = new mapboxgl.Marker({ element: this._el, anchor: 'center' })
          .setLngLat(lngLat);
      }

      addTo(map) {
        this._marker.addTo(map);
        return this;
      }

      remove() {
        this._marker.remove();
        return this;
      }

      setLngLat(ll) {
        this._marker.setLngLat(ll);
        return this;
      }

      getLngLat() {
        return this._marker.getLngLat();
      }

      getElement() {
        return this._el;
      }

      setPopup(p) {
        this._marker.setPopup(p);
        return this;
      }

      setHeading(deg) {
        this._heading = ((deg % 360) + 360) % 360;
        const svg = this._el.querySelector('svg');
        if (svg) {
          svg.style.transform = 'rotate(' + this._heading + 'deg)';
          svg.style.transition = 'none';
        }
        return this;
      }

      setStatus(status) {
        this._status = status;
        const body = this._el.querySelector('#rover-body');
        if (body) {
          const color = status === 'armed' ? '#22c55e' : status === 'rtk' ? '#3b82f6' : '#f4d03f';
          body.setAttribute('fill', color);
        }
        return this;
      }

      getStatus() {
        return this._status;
      }
    }

    // EMLID-STYLE POINTS: waypoints render as a native GL circle layer (+ number labels),
    // not DOM markers. All points are one GeoJSON source, so 400+ points draw on the GPU
    // in a single setData with no chunking, and per-point color changes use setFeatureState.
    function buildPointsFC() {
      return {
        type: 'FeatureCollection',
        features: waypoints.map((wp, i) => ({
          type: 'Feature',
          id: i, // top-level numeric id → addressable by setFeatureState
          properties: {
            index: i,
            isStart: i === 0,
            isEnd: i === waypoints.length - 1,
          },
          geometry: { type: 'Point', coordinates: [wp.lon, wp.lat] },
        })),
      };
    }

    // Push current waypoints into the point source and re-apply active/completed state.
    // Called after loading waypoints and after a style switch (setStyle wipes feature state).
    function refreshMissionPoints() {
      const src = map.getSource('mission-points');
      if (!src) return;
      src.setData(buildPointsFC());
      for (let i = 0; i < waypoints.length; i++) {
        map.setFeatureState(
          { source: 'mission-points', id: i },
          { completed: !!waypoints[i].isCompleted, active: i === currentActiveIndex }
        );
      }
      console.log('[MissionMap] Points refreshed:', waypoints.length);
    }

    // Add sources and layers on map load
    function ensureMissionLayers() {
      // Mission path — thin solid line (Emlid-style), drawn beneath the point dots
      if (!map.getSource('mission-path')) {
        map.addSource('mission-path', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
        });
        map.addLayer({
          id: 'mission-line',
          type: 'line',
          source: 'mission-path',
          paint: {
            'line-color': '#000000',
            'line-width': 2,
            'line-opacity': 0.9
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
      }

      // Waypoint points — native GL circle layer with data-driven color.
            // Generated backend trajectory.
      // Purple line and purple dots are drawn below original marking points.
      if (!map.getSource('generated-trajectory')) {
        map.addSource('generated-trajectory', {
          type: 'geojson',
          data: generatedTrajectoryData
        });
      }

      if (!map.getLayer('generated-trajectory-line')) {
        map.addLayer({
          id: 'generated-trajectory-line',
          type: 'line',
          source: 'generated-trajectory',
          filter: [
            '==',
            ['get', 'kind'],
            'line'
          ],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
          'line-color': '#A855F7',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            2,
            19,
            3,
            22,
            4,
            24,
            5
          ],
          'line-opacity': 1
        }
        });
      }

      if (!map.getLayer('generated-trajectory-points')) {
  map.addLayer({
    id: 'generated-trajectory-points',
    type: 'circle',
    source: 'generated-trajectory',
    filter: [
      '==',
      ['get', 'kind'],
      'point'
    ],
    paint: {
      'circle-color': '#F0ABFC',

      /**
       * At low zoom, generated points are extremely close together.
       * Keep the dots small so they do not form a wavy bead chain.
       */
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        15,
        0.5,
        18,
        1,
        21,
        2,
        24,
        3
      ],

      'circle-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        15,
        0.25,
        18,
        0.5,
        20,
        0.85,
        22,
        1
      ],

      'circle-stroke-width': 0
    }
  });
}

      // completed (feature-state) > active (feature-state) > start > end > normal.
      if (!map.getSource('mission-points')) {
        // Top-level numeric feature id (set in buildPointsFC) is used directly by
        // setFeatureState — no promoteId needed since the id is not inside properties.
        map.addSource('mission-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
          id: 'mission-point-dots',
          type: 'circle',
          source: 'mission-points',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 18, 6],
            // Emlid-style: every point is black; only completed turns green.
            // (accuracy/error → red is intentionally NOT wired yet; the 'active'
            //  feature-state is still written but not painted, so a highlight can
            //  be re-enabled later by adding a branch here.)
            'circle-color': [
              'case',
              ['boolean', ['feature-state', 'completed'], false], '#22c55e',
              '#000000'
            ],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff'
          }
        });
        // Number labels above each dot; Mapbox collision detection hides overlaps at low zoom
        map.addLayer({
          id: 'mission-point-labels',
          type: 'symbol',
          source: 'mission-points',
          layout: {
            'text-field': ['to-string', ['+', ['get', 'index'], 1]],
            'text-size': 11,
            'text-offset': [0, -1.1],
            'text-anchor': 'bottom',
            'text-allow-overlap': false,
            'text-ignore-placement': false
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#000000',
            'text-halo-width': 1
          }
        });
      }
    }

    function refreshMissionPath() {
      if (waypoints.length > 1) {
        const pathCoords = waypoints.map(wp => [wp.lon, wp.lat]);
        const source = map.getSource('mission-path');
        if (source) {
          source.setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: pathCoords }
          });
        }
      }
    }

    map.on('load', function() {
      ensureMissionLayers();

      // Draw any waypoints already present (usually empty — data is injected after load)
      if (waypoints.length > 0) {
        refreshMissionPoints();
        refreshMissionPath();
      }

      // Draw rover marker and heading
      if (roverData.hasPosition) {
        const size = 40;
        const rotation = roverData.heading !== null ? roverData.heading : 0;

        const roverIconSVG = \`
          <svg width="\${size}" height="\${size}" viewBox="-16 -16 32 32" xmlns="http://www.w3.org/2000/svg" style="background: transparent; transform: rotate(\${rotation}deg); will-change: transform;">
            <ellipse cx="-10.4" cy="-7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
            <ellipse cx="10.4" cy="-7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
            <ellipse cx="-10.4" cy="7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
            <ellipse cx="10.4" cy="7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
            <ellipse cx="-10.4" cy="-7.1" rx="1.55" ry="2.7" fill="#64748b"/>
            <ellipse cx="10.4" cy="-7.1" rx="1.55" ry="2.7" fill="#64748b"/>
            <ellipse cx="-10.4" cy="7.1" rx="1.55" ry="2.7" fill="#64748b"/>
            <ellipse cx="10.4" cy="7.1" rx="1.55" ry="2.7" fill="#64748b"/>
            <rect x="-6.6" y="-8.4" width="13.2" height="16.8" rx="2.6" fill="#f5c518" stroke="#ffffff" stroke-width="1.15"/>
            <rect x="-5.4" y="-8.4" width="10.8" height="3.4" rx="1.2" fill="#334155"/>
            <rect x="-4.6" y="-4.6" width="9.2" height="5.4" rx="1.1" fill="rgba(15,23,42,0.2)"/>
            <rect x="-3.3" y="2.2" width="6.6" height="4.4" rx="1" fill="#0f172a"/>
            <rect x="-3.6" y="-7.5" width="2.5" height="1.35" rx="0.45" fill="#67e8f9"/>
            <rect x="1.1" y="-7.5" width="2.5" height="1.35" rx="0.45" fill="#67e8f9"/>
            <circle cx="0" cy="8.2" r="1.05" fill="#94a3b8" stroke="#fff" stroke-width="0.45"/>
          </svg>
        \`;

        roverMarker = new RoverMarker([roverData.lon, roverData.lat], { iconSVG: roverIconSVG, heading: rotation });
        roverMarker.addTo(map);
        roverMarker.setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(\`<strong>Rover</strong><br>Heading: \${roverData.heading !== null ? roverData.heading.toFixed(1) + '°' : 'N/A'}<br>Lat: \${roverData.lat.toFixed(7)}<br>Lon: \${roverData.lon.toFixed(7)}\`));
      }

      // Fit map to show all markers
      setTimeout(() => {
        const b = new mapboxgl.LngLatBounds();
        waypoints.forEach(wp => b.extend([wp.lon, wp.lat]));
        if (roverData.hasPosition) b.extend([roverData.lon, roverData.lat]);

        if (waypoints.length > 0 || roverData.hasPosition) {
          map.fitBounds(b, { padding: 50 });
        }
      }, 100);

      // Notify React Native that map is ready
      setTimeout(() => {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
        }
      }, 300);
    });

    // Zoom event handlers
    map.on('zoomstart', function() {
      map.getCanvas().style.pointerEvents = 'none';
    });

    map.on('zoomend', function() {
      map.getCanvas().style.pointerEvents = '';
      map.resize();
    });

    function centerOnRover() {
      if (liveRoverPos) {
        map.flyTo({ center: [liveRoverPos.lon, liveRoverPos.lat], zoom: 22 });
      }
    }

    function fitToMission() {
      if (waypoints.length === 0) return;
      const b = new mapboxgl.LngLatBounds();
      waypoints.forEach(wp => b.extend([wp.lon, wp.lat]));
      map.fitBounds(b, { padding: 50, animate: true });
    }

    function setMapStyle(styleName) {
      const styleUrl = styleName === 'dark'
        ? '${MAPBOX_STYLE_DARK}'
        : (styleName === 'streets' ? '${MAPBOX_STYLE_STREETS}' : '${MAPBOX_STYLE_SATELLITE}');
      map.setStyle(styleUrl);
    }

    window.centerOnRover = centerOnRover;
    window.fitToMission = fitToMission;
    window.setMapStyle = setMapStyle;
        window.loadGeneratedTrajectory = function(data) {
      try {
        generatedTrajectoryData =
          data &&
          data.type === 'FeatureCollection'
            ? data
            : {
                type: 'FeatureCollection',
                features: []
              };

        const source =
          map.getSource('generated-trajectory');

        if (source) {
          source.setData(
            generatedTrajectoryData
          );
        }

        console.log(
          '[MissionMap] Generated trajectory loaded:',
          generatedTrajectoryData.features.length
        );
      } catch (e) {
        console.error(
          '[MissionMap] Generated trajectory load error:',
          e
        );
      }
    };

    map.on('style.load', function() {
      ensureMissionLayers();
      refreshMissionPoints();
      refreshMissionPath();
    });

    // Track active waypoint index
    let currentActiveIndex = waypoints.findIndex(wp => wp.isActive);
    if (currentActiveIndex === -1) currentActiveIndex = -1;

    // READ-ONLY OPTIMIZATION: active waypoint highlight via feature-state (no geometry resend)
    window.setActiveWaypoint = function(index) {
      if (index === currentActiveIndex) return;

      if (currentActiveIndex >= 0 && currentActiveIndex < waypoints.length) {
        map.setFeatureState({ source: 'mission-points', id: currentActiveIndex }, { active: false });
      }
      if (index >= 0 && index < waypoints.length) {
        map.setFeatureState({ source: 'mission-points', id: index }, { active: true });
      }

      currentActiveIndex = index;
    };

    // Update waypoint completion statuses via feature-state
    window.updateWaypointStatuses = function(flags) {
      if (!Array.isArray(flags)) return;
      const n = Math.min(flags.length, waypoints.length);
      for (let i = 0; i < n; i++) {
        if (waypoints[i]) waypoints[i].isCompleted = !!flags[i];
        map.setFeatureState({ source: 'mission-points', id: i }, { completed: !!flags[i] });
      }
    };

    // Clear all waypoint points and the mission line
    window.clearAllMarkers = function() {
      try {
        map.getSource('mission-points')?.setData({ type: 'FeatureCollection', features: [] });
        map.getSource('mission-path')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
      } catch(e) {
        console.error('[MissionMap] clearAllMarkers error:', e);
      }
    };

    // Load waypoints from React Native
    window.loadWaypointsFromReactNative = function(wpArray) {
      try {
        const newWaypoints = Array.isArray(wpArray) ? wpArray : (typeof wpArray === 'string' ? JSON.parse(wpArray) : []);
        if (!Array.isArray(newWaypoints) || newWaypoints.length === 0) return;

        window.clearAllMarkers();

        waypoints.length = 0;
        for (let i = 0; i < newWaypoints.length; i++) {
          waypoints.push(newWaypoints[i]);
        }

        currentActiveIndex = waypoints.findIndex(wp => wp.isActive);

        if (waypoints.length > 0) {
          map.setCenter([waypoints[0].lon, waypoints[0].lat]);
          map.setZoom(15);
        }

        refreshMissionPoints();
        refreshMissionPath();

        setTimeout(function() {
          map.resize();
          const b = new mapboxgl.LngLatBounds();
          waypoints.forEach(wp => b.extend([wp.lon, wp.lat]));
          if (liveRoverPos) b.extend([liveRoverPos.lon, liveRoverPos.lat]);
          if (waypoints.length > 0 || liveRoverPos) map.fitBounds(b, { padding: 50 });
        }, 200);

        console.log('[MissionMap] Loaded ' + waypoints.length + ' waypoints from React Native');
      } catch (e) {
        console.error('[MissionMap] Failed to load waypoints:', e);
      }
    };
  </script>
</body>
</html>
    `;
  }, []); // Empty dependencies - HTML generated ONLY ONCE on mount, NEVER regenerated

  // Memoize source prop to avoid new object reference every render
  const mapSource = useMemo(() => ({ html: mapHTML }), [mapHTML]);

  /**
   * Draw the generated trajectory from authoritative geographic coordinates
   * returned by rover_backend.
   *
   * Do not reconstruct GPS from local ENU in the frontend. The backend uses
   * PX4 gp_origin and the exact inverse PX4 MapProjection, so the displayed
   * path and rover navigation share the same projection authority.
   */
  const generatedTrajectoryGeoJson = useMemo(() => {
    const coordinates = trajectoryPoints
      .filter(
        (
          point,
        ): point is LoadedPathPoint & {
          latitude: number;
          longitude: number;
        } =>
          typeof point.latitude === "number" &&
          Number.isFinite(point.latitude) &&
          point.latitude >= -90 &&
          point.latitude <= 90 &&
          typeof point.longitude === "number" &&
          Number.isFinite(point.longitude) &&
          point.longitude >= -180 &&
          point.longitude <= 180,
      )
      .map(
        (point) =>
          [point.longitude, point.latitude] as [number, number],
      );

    const features: any[] = [];

    if (coordinates.length >= 2) {
      features.push({
        type: "Feature",
        properties: {
          kind: "line",
        },
        geometry: {
          type: "LineString",
          coordinates,
        },
      });
    }

    /**
     * Add every generated interpolation point as a purple dot.
     * Backend preview is already limited, so this remains GPU-rendered
     * through one GeoJSON source instead of thousands of React markers.
     */
    /**
     * Keep the full LineString, but do not draw a large circle
     * for every 50 mm interpolation point.
     *
     * Maximum visible dots: approximately 400.
     * This changes only the display, not the rover trajectory.
     */
    const visiblePointStep = Math.max(1, Math.ceil(coordinates.length / 400));

    coordinates.forEach((coordinate, index) => {
      const isFirstPoint = index === 0;

      const isLastPoint = index === coordinates.length - 1;

      const shouldDisplay =
        isFirstPoint || isLastPoint || index % visiblePointStep === 0;

      if (!shouldDisplay) {
        return;
      }

      features.push({
        type: "Feature",
        properties: {
          kind: "point",
          index,
        },
        geometry: {
          type: "Point",
          coordinates: coordinate,
        },
      });
    });

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [trajectoryPoints]);

  // Inject waypoints after WebView loads AND when waypoints change
  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;

    // Empty waypoints — clear the map
    if (!waypoints || waypoints.length === 0) {
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            if (window.clearAllMarkers) window.clearAllMarkers();
            waypoints.length = 0;
          } catch(e) { console.error('[MissionMap] Clear error:', e); }
        })();
        true;
      `);
      return;
    }

    const waypointsArray = waypoints.map((wp, idx) => {
      const wpStatus = statusMap?.[wp.sn];
      const isCompleted =
        wpStatus?.status === "completed" || wpStatus?.status === "skipped";
      return {
        id: wp.sn,
        uniqueId: `wp-${idx}-${wp.sn}`,
        lat: wp.lat,
        lon: wp.lon,
        block: wp.block,
        row: wp.row,
        pile: wp.pile,
        isActive: idx === activeWaypointIndexRef.current,
        isStart: idx === 0,
        isEnd: idx === waypoints.length - 1,
        isCompleted,
      };
    });

    webViewRef.current.injectJavaScript(`
      (function() {
        window.__waypointsData = ${JSON.stringify(waypointsArray)};
        if (window.loadWaypointsFromReactNative) {
          window.loadWaypointsFromReactNative(window.__waypointsData);
        }
        delete window.__waypointsData;
      })();
      true;
    `);
    console.log(`[MissionMap] Injected ${waypoints.length} waypoints`);
  }, [mapReady, waypoints]); // activeWaypointIndex handled by the dedicated setActiveWaypoint effect below

  // Pause/resume Mapbox rendering when visibility changes

  // Draw generated trajectory directly on the main Mapbox display.
  useEffect(() => {
    if (!mapReady || !webViewRef.current) {
      return;
    }

    const trajectoryJson = JSON.stringify(generatedTrajectoryGeoJson);

    webViewRef.current.injectJavaScript(`
      (function() {
        try {
          if (
            window.loadGeneratedTrajectory
          ) {
            window.loadGeneratedTrajectory(
              ${trajectoryJson}
            );
          }
        } catch(e) {
          console.error(
            '[MissionMap] Trajectory injection error:',
            e
          );
        }
      })();

      true;
    `);

    console.log(
      "[MissionMap] Injected generated trajectory:",
      generatedTrajectoryGeoJson.features.length,
      "features",
    );
  }, [mapReady, generatedTrajectoryGeoJson]);
  // This stops tile loading, marker animation, and continuous redraws when hidden
  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;

    if (isVisible) {
      // Resume: resize and re-enable interactions
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            if (typeof map !== 'undefined' && map) {
              map.resize();
              map.dragPan.enable();
              map.touchZoomRotate.enable();
              map.doubleClickZoom.enable();
              map.scrollZoom.enable();
            }
          } catch(e) { console.error('[MissionMap] Resume error:', e); }
        })();
        true;
      `);
    } else {
      // Pause: disable interactions, reduce redraws
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            if (typeof map !== 'undefined' && map) {
              map.dragPan.disable();
              map.touchZoomRotate.disable();
              map.doubleClickZoom.disable();
              map.scrollZoom.disable();
            }
          } catch(e) { console.error('[MissionMap] Pause error:', e); }
        })();
        true;
      `);
    }
  }, [isVisible, mapReady]);

  // Initialize rover marker once when map is ready
  useEffect(() => {
    if (!mapReady || !webViewRef.current || mapInitializedRef.current) return;
    if (!Number.isFinite(roverLat) || !Number.isFinite(roverLon)) return;

    console.log("[MissionMap] Initializing rover marker");
    mapInitializedRef.current = true;

    const initScript = `
      (function() {
        try {
          if (!roverMarker && ${Number.isFinite(roverLat)} && ${Number.isFinite(roverLon)}) {
            const size = 40;
            const rotation = ${heading || 0};

            const roverIconSVG = \`
              <svg width="\${size}" height="\${size}" viewBox="-16 -16 32 32" xmlns="http://www.w3.org/2000/svg" style="background: transparent; transform: rotate(\${rotation}deg); will-change: transform;">
                <ellipse cx="-10.4" cy="-7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
                <ellipse cx="10.4" cy="-7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
                <ellipse cx="-10.4" cy="7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
                <ellipse cx="10.4" cy="7.1" rx="3.15" ry="5.15" fill="#0f172a"/>
                <ellipse cx="-10.4" cy="-7.1" rx="1.55" ry="2.7" fill="#64748b"/>
                <ellipse cx="10.4" cy="-7.1" rx="1.55" ry="2.7" fill="#64748b"/>
                <ellipse cx="-10.4" cy="7.1" rx="1.55" ry="2.7" fill="#64748b"/>
                <ellipse cx="10.4" cy="7.1" rx="1.55" ry="2.7" fill="#64748b"/>
                <rect x="-6.6" y="-8.4" width="13.2" height="16.8" rx="2.6" fill="#f5c518" stroke="#ffffff" stroke-width="1.15"/>
                <rect x="-5.4" y="-8.4" width="10.8" height="3.4" rx="1.2" fill="#334155"/>
                <rect x="-4.6" y="-4.6" width="9.2" height="5.4" rx="1.1" fill="rgba(15,23,42,0.2)"/>
                <rect x="-3.3" y="2.2" width="6.6" height="4.4" rx="1" fill="#0f172a"/>
                <rect x="-3.6" y="-7.5" width="2.5" height="1.35" rx="0.45" fill="#67e8f9"/>
                <rect x="1.1" y="-7.5" width="2.5" height="1.35" rx="0.45" fill="#67e8f9"/>
                <circle cx="0" cy="8.2" r="1.05" fill="#94a3b8" stroke="#fff" stroke-width="0.45"/>
              </svg>
            \`;

            roverMarker = new RoverMarker([${roverLon}, ${roverLat}], { iconSVG: roverIconSVG, heading: rotation });
            roverMarker.addTo(map);
            roverMarker.setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(\`<strong>Rover</strong><br>Heading: ${heading !== null ? heading.toFixed(1) + "°" : "N/A"}<br>Lat: ${roverLat.toFixed(7)}<br>Lon: ${roverLon.toFixed(7)}\`));
          }
        } catch (e) {
          console.error('Rover marker init error:', e);
        }
      })();
      true;
    `;

    webViewRef.current.injectJavaScript(initScript);
  }, [mapReady, roverLat, roverLon, heading]);

  // Cleanup WebView on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (webViewRef.current) {
        try {
          webViewRef.current.injectJavaScript(`
            (function() {
              try {
                // Clean up Mapbox map (this also disposes point/line sources and layers)
                if (typeof map !== 'undefined' && map) {
                  map.remove();
                  map = null;
                }
                console.log('[MissionMap] WebView cleaned up');
              } catch (e) {
                console.error('[MissionMap] Cleanup error:', e);
              }
            })();
            true;
          `);
        } catch (e) {
          console.error("[MissionMap] WebView cleanup injection failed:", e);
        }
      }
    };
  }, []);

  // Update active waypoint highlight when index changes
  useEffect(() => {
    if (
      !mapReady ||
      !webViewRef.current ||
      activeWaypointIndex === undefined ||
      activeWaypointIndex === null
    )
      return;
    webViewRef.current.injectJavaScript(
      `(function() { if (window.setActiveWaypoint) window.setActiveWaypoint(${activeWaypointIndex}); })(); true;`,
    );
  }, [activeWaypointIndex, mapReady]);

  // Lightweight bridge: sync completion flags into the WebView without recreating markers.
  // Sends a boolean array aligned to the current waypoints order whenever statusMap changes.
  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;
    if (!waypoints || waypoints.length === 0) return;
    const completedFlags = waypoints.map(
      (wp) =>
        statusMap?.[wp.sn]?.status === "completed" ||
        statusMap?.[wp.sn]?.status === "skipped",
    );
    webViewRef.current.injectJavaScript(
      `(function() { if (window.updateWaypointStatuses) window.updateWaypointStatuses(${JSON.stringify(
        completedFlags,
      )}); })(); true;`,
    );
  }, [statusMap, mapReady, waypoints]);

  // Update rover position, heading, and trail via JavaScript injection
  // Skip updates when not visible to save JS thread and GPU
  useEffect(() => {
    if (!isVisible) return; // Don't inject JS when tab is hidden
    if (!mapReady || !webViewRef.current || !mapInitializedRef.current) {
      if (Math.random() < 0.05) {
        // Log 5% of skipped updates for debugging
        console.log(
          "[MissionMap] Skipping rover update - mapReady:",
          mapReady,
          "webViewRef:",
          !!webViewRef.current,
          "mapInit:",
          mapInitializedRef.current,
        );
      }
      return;
    }
    if (!Number.isFinite(roverLat) || !Number.isFinite(roverLon)) {
      if (Math.random() < 0.05) {
        console.log(
          "[MissionMap] Skipping rover update - invalid position:",
          roverLat,
          roverLon,
        );
      }
      return;
    }

    // Calculate rover status based on armed state and RTK fix type
    const status = armed ? "armed" : rtkFixType >= 5 ? "rtk" : "disarmed";

    const updateScript = `
      (function() {
        try {
          // Update rover position
          if (roverMarker) {
            roverMarker.setLngLat([${roverLon}, ${roverLat}]);
            liveRoverPos = { lat: ${roverLat}, lon: ${roverLon} };

            // WEB APP STYLE: Fast rotation using RoverMarker class method
            if (${heading !== null}) {
              roverMarker.setHeading(${heading || 0});
            }

            // WEB APP STYLE: Dynamic status colors (armed=green, RTK=blue, disarmed=yellow)
            roverMarker.setStatus('${status}');

          }
        } catch (e) {
          console.error('Map update error:', e);
        }
      })();
      true;
    `;

    webViewRef.current.injectJavaScript(updateScript);
  }, [roverLat, roverLon, heading, armed, rtkFixType, mapReady, isVisible]);

  const injectMapJs = (script: string) => {
    if (!mapReady) return;
    webViewRef.current?.injectJavaScript(script);
  };

  const handleToggleMapStyle = () => {
    // Cycle: satellite (default) → streets → dark → satellite
    const order: Array<"satellite" | "streets" | "dark"> = [
      "satellite",
      "streets",
      "dark",
    ];
    const newStyle = order[(order.indexOf(mapStyle) + 1) % order.length];
    setMapStyle(newStyle);
    injectMapJs(`window.setMapStyle('${newStyle}'); true;`);
  };

  return (
    <View style={styles.mapContainer}>
      <WebView
        ref={webViewRef}
        source={mapSource}
        style={{
          flex: 1,
          borderRadius: edgeToEdge ? 0 : 12,
          backgroundColor: "#1e293b",
        }}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === "mapReady") {
              setMapReady(true);
              // Fix: Mapbox initializes before WebView layout finalizes.
              // resize() forces Mapbox to re-measure its container,
              // then fitBounds re-centers correctly at actual dimensions.
              setTimeout(() => {
                webViewRef.current?.injectJavaScript(`
                  (function() {
                    try {
                      map.resize();
                      if (waypoints.length > 0) {
                        const b = new mapboxgl.LngLatBounds();
                        waypoints.forEach(wp => b.extend([wp.lon, wp.lat]));
                        if (liveRoverPos) b.extend([liveRoverPos.lon, liveRoverPos.lat]);
                        if (waypoints.length > 0 || liveRoverPos) map.fitBounds(b, { padding: 50 });
                      } else if (liveRoverPos) {
                        map.setCenter([liveRoverPos.lon, liveRoverPos.lat]);
                        map.setZoom(17);
                      }
                    } catch(e) {}
                  })();
                  true;
                `);
              }, 300);
            }
          } catch (error) {
            console.error("WebView message error:", error);
          }
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false} // PERFORMANCE: Don't show loading indicator, faster init
        scalesPageToFit={false}
        androidLayerType="hardware" // ANDROID: Force hardware acceleration
        cacheEnabled={true} // PERFORMANCE: Enable caching
        cacheMode="LOAD_DEFAULT" // Use cache when available
      />

      <MapBottomControlsBar
        mapStyle={mapStyle}
        disabled={!mapReady}
        onToggleMapStyle={handleToggleMapStyle}
        onFitMission={() => injectMapJs("window.fitToMission(); true;")}
        onCenterRover={() => injectMapJs("window.centerOnRover(); true;")}
        onZoomIn={() =>
          injectMapJs('if (typeof map !== "undefined") { map.zoomIn(); } true;')
        }
        onZoomOut={() =>
          injectMapJs(
            'if (typeof map !== "undefined") { map.zoomOut(); } true;',
          )
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1e293b",
  },
});

export const MissionMap = React.memo(MissionMapBase);
