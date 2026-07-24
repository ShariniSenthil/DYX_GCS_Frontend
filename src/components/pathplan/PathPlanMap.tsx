import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  PanResponder,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import {
  DxfMapEntity,
  PathPlanWaypoint,
  DrawingMode,
} from "../../types/pathplan";
import {
  MAPBOX_JS_URL,
  MAPBOX_CSS_URL,
  MAPBOX_ACCESS_TOKEN,
  MAPBOX_STYLE_SATELLITE,
  MAPBOX_STYLE_STREETS,
  MAPBOX_STYLE_DARK,
} from "../../config/mapboxConfig";

type VisualizationKey =
  | "distanceLabel"
  | "angleLabel"
  | "snapFeature"
  | "roverIcon"
  | "waypointPreview";

type VisualizationState = Record<VisualizationKey, boolean>;

type ToggleMenuItem<Key extends string> = {
  key: Key;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const MAP_SETTINGS_ITEMS: ToggleMenuItem<VisualizationKey>[] = [
  { key: "distanceLabel", label: "Distance Label", icon: "ruler" },
  { key: "angleLabel", label: "Angle Label", icon: "angle-acute" },
  { key: "snapFeature", label: "Snap Feature", icon: "magnet" },
  { key: "roverIcon", label: "Rover Icon", icon: "robot" },
  { key: "waypointPreview", label: "Waypoint Preview", icon: "map-marker" },
];

const PATH_PLAN_WIDGET_MENU_LEFT = 80;
const PATH_PLAN_WIDGET_MENU_TOP = 76;
const PATH_PLAN_WIDGET_MENU_WIDTH = 280;
const PATH_PLAN_WIDGET_MENU_HEIGHT = 345;

interface Props {
  waypoints: PathPlanWaypoint[];
  dxfEntities?: DxfMapEntity[];
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  onWaypointDrag?: (
    id: number,
    coordinate: { latitude: number; longitude: number },
  ) => void;
  onWaypointClick?: (id: number) => void;
  onAddWaypoints?: (
    coordinates: { latitude: number; longitude: number }[],
  ) => void;
  onDeleteWaypoint?: (id: number) => void;
  onInsertWaypoint?: (
    afterId: number,
    coordinate: { latitude: number; longitude: number },
  ) => void;
  onWaypointConnect?: (fromId: number, toId: number) => void;
  roverPosition?: { lat: number; lon: number };
  selectedWaypoint?: number | null;
  heading?: number | null;
  activeDrawingTool?: string | null;
  onDrawingComplete?: (
    points: { latitude: number; longitude: number }[],
  ) => void;
  isDrawingMode?: boolean;
  drawSettings?: {
    startPosition: { lat: number; lng: number };
    drawingWidth: number;
    drawingHeight: number;
    waypointSpacing?: number;
  } | null;
  isDrawingToolsVisible?: boolean;
  setIsDrawingToolsVisible?: (val: boolean) => void;
  isMissionOpsVisible?: boolean;
  setIsMissionOpsVisible?: (val: boolean) => void;
  isStatisticsVisible?: boolean;
  setIsStatisticsVisible?: (val: boolean) => void;
  isBottomTableVisible?: boolean;
  setIsBottomTableVisible?: (val: boolean) => void;
  isRobotPositionVisible?: boolean;
  setIsRobotPositionVisible?: (val: boolean) => void;
  isManualConnectionMode?: boolean;
  manualConnections?: number[];
  manualConnectionMode?: "tap" | "drag" | "pan";
  visualization?: VisualizationState;
  onVisualizationToggle?: (key: VisualizationKey) => void;
  measurePoints?: {
    lat: number;
    lon: number;
    seq: number;
    waypointId?: number;
  }[];
  measureResult?: { distance: number; heading: number } | null;
  onMeasureClear?: () => void;
  onMeasureWaypointSelect?: (id: number) => void;
  isVisible?: boolean;
  zoomTrigger?: { type: "in" | "out"; timestamp: number } | null;
  isVisMenuOpen?: boolean;
  setIsVisMenuOpen?: (val: boolean) => void;
  isWidgetMenuOpen?: boolean;
  setIsWidgetMenuOpen?: (val: boolean) => void;
  onDismissPanel?: () => void;
}

export const PathPlanMap: React.FC<Props> = ({
  waypoints,
  dxfEntities = [],
  onMapPress,
  onWaypointDrag,
  onAddWaypoints,
  onDeleteWaypoint,
  onInsertWaypoint,
  onWaypointClick,
  onWaypointConnect,
  roverPosition = null,
  selectedWaypoint = null,
  heading = null,
  activeDrawingTool = null,
  onDrawingComplete,
  isDrawingMode = false,
  drawSettings = null,
  isDrawingToolsVisible = true,
  setIsDrawingToolsVisible = () => {},
  isMissionOpsVisible = true,
  setIsMissionOpsVisible = () => {},
  isStatisticsVisible = true,
  setIsStatisticsVisible = () => {},
  isBottomTableVisible = true,
  setIsBottomTableVisible = () => {},
  isRobotPositionVisible = false,
  setIsRobotPositionVisible = () => {},
  isManualConnectionMode = false,
  manualConnections = [],
  manualConnectionMode = "tap",
  visualization = {
    distanceLabel: true,
    angleLabel: true,
    snapFeature: true,
    roverIcon: true,
    waypointPreview: true,
  },
  onVisualizationToggle,
  measurePoints = [],
  measureResult = null,
  onMeasureClear,
  onMeasureWaypointSelect,
  isVisible = true,
  zoomTrigger = null,
  isVisMenuOpen = false,
  setIsVisMenuOpen = () => {},
  isWidgetMenuOpen = false,
  setIsWidgetMenuOpen = () => {},
  onDismissPanel,
}) => {
  const webViewRef = useRef<WebView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<"satellite" | "streets" | "dark">(
    "satellite",
  );
  const lastUpdateRef = useRef<number>(0);
  const UPDATE_THROTTLE_MS = 100;

  const [drawingMode, setDrawingMode] = useState<DrawingMode>("none");
  const [tempPoints, setTempPoints] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    waypointId: number;
  } | null>(null);
  const [measureOverlayPos, setMeasureOverlayPos] = useState({ x: 10, y: 120 });
  const measurePanResponderRef = useRef<any>(null);
  const measureDragStartRef = useRef({ x: 0, y: 0 });

  const drawingPointsRef = useRef<{ lat: number; lng: number }[]>([]);
  const lastWaypointsRef = useRef<string>("");
  const lastDxfEntitiesRef = useRef<string>("");
  const lastSelectedRef = useRef<number | null>(null);

  const measureOverlayPosRef = useRef(measureOverlayPos);
  measureOverlayPosRef.current = measureOverlayPos;

  useEffect(() => {
    if (!isVisible || !mapReady || !webViewRef.current) return;

    const hasValidRover =
      roverPosition != null &&
      Number.isFinite(roverPosition.lat) &&
      Number.isFinite(roverPosition.lon) &&
      roverPosition.lat >= -90 &&
      roverPosition.lat <= 90 &&
      roverPosition.lon >= -180 &&
      roverPosition.lon <= 180 &&
      !(roverPosition.lat === 0 && roverPosition.lon === 0);

    if (!hasValidRover || !roverPosition) return;

    const roverLat = roverPosition.lat;
    const roverLon = roverPosition.lon;
    const roverHeading =
      heading != null && Number.isFinite(heading) ? heading : 0;

    const updateScript = `
    (function() {
      const lat = ${roverLat};
      const lon = ${roverLon};
      const heading = ${roverHeading};

      if (!roverMarker) {
        const size = 56;

        const roverIconSVG =
          '<svg width="' + size + '" height="' + size +
          '" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
          '<g style="transform:rotate(' + heading +
          'deg);transform-origin:50px 50px;">' +
          '<rect x="15" y="15" width="12" height="20" rx="2" fill="#2d2d2d"/>' +
          '<rect x="73" y="15" width="12" height="20" rx="2" fill="#2d2d2d"/>' +
          '<rect x="15" y="65" width="12" height="20" rx="2" fill="#2d2d2d"/>' +
          '<rect x="73" y="65" width="12" height="20" rx="2" fill="#2d2d2d"/>' +
          '<rect x="30" y="25" width="40" height="50" rx="3" fill="#f4d03f" stroke="#d4af37" stroke-width="2"/>' +
          '<line x1="50" y1="25" x2="50" y2="5" stroke="#e74c3c" stroke-width="4"/>' +
          '<polygon points="50,0 43,10 57,10" fill="#e74c3c"/>' +
          '</g></svg>';

        const roverEl = document.createElement('div');
        roverEl.style.width = size + 'px';
        roverEl.style.height = size + 'px';
        roverEl.innerHTML = roverIconSVG;

        roverMarker = new mapboxgl.Marker({
          element: roverEl,
          anchor: 'center'
        })
          .setLngLat([lon, lat])
          .addTo(map);
      } else {
        roverMarker.setLngLat([lon, lat]);

        const markerEl = roverMarker.getElement();
        const svgGroup = markerEl.querySelector('svg g');

        if (svgGroup) {
          svgGroup.style.transform =
            'rotate(' + heading + 'deg)';
          svgGroup.style.transformOrigin = '50px 50px';
        }
      }

      roverData.hasPosition = true;
      roverData.lat = lat;
      roverData.lon = lon;
      roverData.heading = heading;
    })();

    true;
  `;

    webViewRef.current.injectJavaScript(updateScript);
  }, [isVisible, mapReady, roverPosition?.lat, roverPosition?.lon, heading]);

  useEffect(() => {
    measurePanResponderRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        measureDragStartRef.current = {
          x: measureOverlayPosRef.current.x,
          y: measureOverlayPosRef.current.y,
        };
      },
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(
          0,
          measureDragStartRef.current.x + gestureState.dx,
        );
        const newY = Math.max(
          0,
          measureDragStartRef.current.y + gestureState.dy,
        );
        setMeasureOverlayPos({ x: newX, y: newY });
      },
    });
  }, []);

  const mapHTML = useMemo(() => {
    const waypointsJSON = JSON.stringify([]);
    const hasRover =
      roverPosition != null &&
      Number.isFinite(roverPosition.lat) &&
      Number.isFinite(roverPosition.lon) &&
      roverPosition.lat >= -90 &&
      roverPosition.lat <= 90 &&
      roverPosition.lon >= -180 &&
      roverPosition.lon <= 180 &&
      !(roverPosition.lat === 0 && roverPosition.lon === 0);
    const roverData = JSON.stringify({
      lat: hasRover ? roverPosition.lat : 0,
      lon: hasRover ? roverPosition.lon : 0,
      heading: heading || 0,
      hasPosition: hasRover ? 1 : 0,
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel='stylesheet' href='${MAPBOX_CSS_URL}'/>
  <script src='${MAPBOX_JS_URL}'></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    .mapboxgl-ctrl-attrib, .mapboxgl-ctrl-logo { display: none !important; }

    /* Waypoint pulse animation */
    @keyframes wp-pulse {
      0% { transform: scale(1); opacity: 1; }
      70% { transform: scale(1.3); opacity: 0; }
      100% { transform: scale(1); opacity: 0; }
    }
    .wp-selected-pulse {
      position: relative;
    }
    .wp-selected-pulse::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 50%;
      border: 2px solid rgba(59,130,246,0.6);
      animation: wp-pulse 1.8s ease-out infinite;
      will-change: transform, opacity;
    }

    .custom-marker {
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script>
    mapboxgl.accessToken = '${MAPBOX_ACCESS_TOKEN}';

    const waypoints = ${waypointsJSON};
    const roverData = ${roverData};

    const hasWaypoints = waypoints.length > 0;
    const centerLon = hasWaypoints
      ? waypoints[0].lon
      : roverData.hasPosition
      ? roverData.lon
      : 80.2707;

    const centerLat = hasWaypoints
      ? waypoints[0].lat
      : roverData.hasPosition
      ? roverData.lat
      : 13.0827;

    const map = new mapboxgl.Map({
      container: 'map',
      style: '${MAPBOX_STYLE_SATELLITE}',
      center: [centerLon, centerLat],
      zoom: 17,
      maxZoom: 26,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    window.map = map;

    map.on('error', function(event) {
  const message =
    event && event.error && event.error.message
      ? event.error.message
      : 'Unknown Mapbox error';

  window.ReactNativeWebView.postMessage(
    JSON.stringify({
      type: 'mapError',
      message: message
    })
  );
});

    let roverMarker = null;
    const waypointMarkers = [];
    const markerRegistry = new Map();
    window._activeDragId = null;

    function emptyLine() {
      return { type:'Feature', geometry:{ type:'LineString', coordinates:[] } };
    }

    function emptyCollection() {
      return { type:'FeatureCollection', features:[] };
    }

    function ensureDxfEntityLayers() {
      if (map.getSource('dxf-entities')) return;
      map.addSource('dxf-entities', { type:'geojson', data:emptyCollection(), maxzoom:22, tolerance:0 });
      map.addLayer({ id:'dxf-entity-open-lines', type:'line', source:'dxf-entities',
        filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','closedRing'],true]],
        paint:{'line-color':'#67E8F9','line-width':2.5,'line-opacity':0.92},
        layout:{'line-cap':'round','line-join':'round'} });
      map.addLayer({ id:'dxf-entity-closed-lines', type:'line', source:'dxf-entities',
        filter:['all',['==',['geometry-type'],'LineString'],['==',['get','closedRing'],true]],
        paint:{'line-color':'#67E8F9','line-width':2.5,'line-opacity':0.92},
        layout:{'line-cap':'butt','line-join':'round'} });
      map.addLayer({ id:'dxf-entity-points', type:'circle', source:'dxf-entities',
        filter:['==',['geometry-type'],'Point'],
        paint:{
          'circle-radius':['interpolate',['linear'],['zoom'],12,4,18,7],
          'circle-color':'#67E8F9',
          'circle-stroke-color':'#07111B',
          'circle-stroke-width':1.5,
          'circle-opacity':0.95
        } });
      map.addLayer({ id:'dxf-entity-labels', type:'symbol', source:'dxf-entities',
        filter:['has','label'],
        layout:{
          'text-field':['get','label'],
          'text-size':12,
          'text-offset':[0,1.2],
          'text-anchor':'top'
        },
        paint:{'text-color':'#E5F1FF','text-halo-color':'#07111B','text-halo-width':1.5} });
      if (window.currentDxfEntitiesGeoJson) {
        map.getSource('dxf-entities')?.setData(window.currentDxfEntitiesGeoJson);
      }
    }

    function getWaypointElement(wp, index) {
      const fill = wp.isSelected ? '#3B82F6' : (wp.isStart ? '#16a34a' : '#f97316');
      const size = wp.isSelected ? 48 : 36;
      const svgIcon = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="\${size}" height="\${size}" fill="\${fill}" style="display:block;">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" style="stroke:rgba(0,0,0,0.3);stroke-width:0.5;"/>
        <text x="12" y="10.5" font-family="sans-serif" font-size="12" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">\${index + 1}</text>
      </svg>\`;
      const svgHtml = wp.isSelected ? \`<div class="wp-selected-pulse" style="display:inline-block;">\${svgIcon}</div>\` : svgIcon;
      const el = document.createElement('div');
      el.innerHTML = svgHtml;
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.className = 'custom-marker';
      el.style.cursor = 'pointer';
      return el;
    }

    function createMarker(wp, index) {
      const canDrag = window.isPointToolActive && !window.isManualConnectionMode;
      const el = getWaypointElement(wp, index);
      const size = wp.isSelected ? 48 : 36;
      // Anchor the visual pin TIP (teardrop point sits at viewBox y=22/24, i.e.
      // size*2/24 above the box bottom) onto the geo coord, so it lands exactly
      // on the line vertex. offset is from the element's top-left (anchor).
      // Measured delta confirmed box-bottom anchoring left the tip 3px high @ size 36.
      const marker = new mapboxgl.Marker({ element: el, anchor: 'top-left', offset: [-size / 2, -size * 22 / 24], draggable: canDrag })
        .setLngLat([wp.lon, wp.lat])
        .addTo(map);

      if (canDrag) {
        marker._dragHandlersAttached = true;
        const wpId = wp.id;
        marker.on('dragstart', function() {
          window.dragPreviewState.isDragging = true;
          const wpIdx = window.currentWaypoints.findIndex(function(w) { return w.id === wpId; });
          window.dragPreviewState.draggingWpIndex = wpIdx;
          map.setPaintProperty('mission-line','line-opacity',0.3);
          map.setPaintProperty('mission-glow','line-opacity',0.1);
        });
        marker.on('drag', function() {
          const ll = marker.getLngLat();
          const wpIdx = window.currentWaypoints.findIndex(function(w) { return w.id === wpId; });
          if (wpIdx !== -1) updateDragPreview({ lat:ll.lat, lng:ll.lng }, wpIdx, window.currentWaypoints);
        });
        marker.on('dragend', function() {
          clearDragPreview();
          window.clearOrthoGuide();
          map.setPaintProperty('mission-line','line-opacity',0.9);
          map.setPaintProperty('mission-glow','line-opacity',0.2);
          const ll = marker.getLngLat();
          window.ReactNativeWebView.postMessage(JSON.stringify({ type:'waypointDrag', id:wpId, lat:ll.lat, lng:ll.lng }));
        });
      }

      el.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.orthoGuideState) {
          window.orthoGuideState.lastWaypoint = { lat: wp.lat, lon: wp.lon };
          window.orthoGuideState.isIntentionallyActivated = true;
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type:'waypointClick', id:wp.id }));
        window.ReactNativeWebView.postMessage(JSON.stringify({ type:'waypointContextMenu', waypointId:wp.id, x:e.clientX, y:e.clientY }));
      });

      el.addEventListener('contextmenu', function(e) {
        e.preventDefault(); e.stopPropagation();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type:'waypointContextMenu', id:wp.id, x:e.clientX, y:e.clientY, lat:wp.lat, lon:wp.lon }));
      });

      return marker;
    }

    function updatePolyline(wps) {
      const src = map.getSource('mission-path');
      if (!src) return;
      if (wps.length < 2) { src.setData(emptyLine()); return; }
      src.setData({ type:'Feature', geometry:{ type:'LineString', coordinates: wps.map(w=>[w.lon,w.lat]) } });
    }

    function updatePolylineOpacity(opacity) {
      map.setPaintProperty('mission-line','line-opacity', opacity);
      map.setPaintProperty('mission-glow','line-opacity', opacity * 0.22);
    }

    function diffAndUpdate(newWaypoints) {
      const newIds = new Set(newWaypoints.map(w => w.id));
      markerRegistry.forEach(function(marker, id) {
        if (!newIds.has(id)) { marker.remove(); markerRegistry.delete(id); }
      });
      newWaypoints.forEach(function(wp, index) {
        if (markerRegistry.has(wp.id)) {
          const existing = markerRegistry.get(wp.id);
          const ll = existing.getLngLat();
          if (ll.lat !== wp.lat || ll.lng !== wp.lon) existing.setLngLat([wp.lon, wp.lat]);
        } else {
          markerRegistry.set(wp.id, createMarker(wp, index));
        }
      });
      waypointMarkers.length = 0;
      newWaypoints.forEach(wp => waypointMarkers.push(markerRegistry.get(wp.id)));
      updatePolyline(newWaypoints);
    }

    function chunkedLoad(newWaypoints) {
      const CHUNK = 50;
      var i = 0;
      function loadNext() {
        var slice = newWaypoints.slice(i, i + CHUNK);
        slice.forEach(function(wp, offset) {
          var marker = createMarker(wp, i + offset);
          markerRegistry.set(wp.id, marker);
          waypointMarkers.push(marker);
        });
        i += CHUNK;
        if (i < newWaypoints.length) {
          setTimeout(loadNext, 0);
        } else {
          updatePolyline(newWaypoints);
        }
      }
      loadNext();
    }

    chunkedLoad(waypoints);

    if (roverData.hasPosition) {
      const currentZoom = map.getZoom();
      const zoomScale = Math.max(0.3, Math.min(1.2, (currentZoom - 10) / 12));
      const size = Math.round(84 * zoomScale);
      const rotation = roverData.heading !== null ? roverData.heading : 0;

      const roverIconSVG = \`
        <svg width="\${size}" height="\${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(\${rotation}deg); will-change: transform;">
          <g id="wheels">
            <rect x="15" y="15" width="12" height="20" rx="2" fill="#2d2d2d" stroke="#000" stroke-width="1"/>
            <rect x="17" y="17" width="8" height="16" rx="1" fill="#4a4a4a"/>
            <rect x="73" y="15" width="12" height="20" rx="2" fill="#2d2d2d" stroke="#000" stroke-width="1"/>
            <rect x="75" y="17" width="8" height="16" rx="1" fill="#4a4a4a"/>
            <rect x="15" y="65" width="12" height="20" rx="2" fill="#2d2d2d" stroke="#000" stroke-width="1"/>
            <rect x="17" y="67" width="8" height="16" rx="1" fill="#4a4a4a"/>
            <rect x="73" y="65" width="12" height="20" rx="2" fill="#2d2d2d" stroke="#000" stroke-width="1"/>
            <rect x="75" y="67" width="8" height="16" rx="1" fill="#4a4a4a"/>
          </g>
          <rect x="30" y="25" width="40" height="50" rx="3" fill="#f4d03f" stroke="#d4af37" stroke-width="2"/>
          <rect x="37" y="37" width="10" height="6" rx="1" fill="#5a5a5a"/>
          <rect x="53" y="37" width="10" height="6" rx="1" fill="#5a5a5a"/>
          <rect x="40" y="28" width="5" height="4" fill="#8b7355"/>
          <rect x="55" y="28" width="5" height="4" fill="#8b7355"/>
          <rect x="40" y="68" width="5" height="4" fill="#8b7355"/>
          <rect x="55" y="68" width="5" height="4" fill="#8b7355"/>
          <g id="heading-arrow">
            <line x1="50" y1="25" x2="50" y2="5" stroke="#e74c3c" stroke-width="4" stroke-linecap="round"/>
            <polygon points="50,0 43,10 57,10" fill="#e74c3c"/>
          </g>
        </svg>
      \`;

      const roverEl = document.createElement('div');
      roverEl.style.cssText = \`width:\${size}px;height:\${size}px;\`;
      roverEl.innerHTML = roverIconSVG;
      roverMarker = new mapboxgl.Marker({ element: roverEl, anchor: 'center' })
        .setLngLat([roverData.lon, roverData.lat])
        .addTo(map);
    }

    window.ORTHO_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    window.ORTHO_SNAP_THRESHOLD = 5;
    window.orthoGuideState = {
      lastWaypoint: null,
      isActive: false,
      currentBearing: null,
      isIntentionallyActivated: false,
      _labelEl: null,
      _labelMarker: null
    };

    window.mapVisualization = {
      distanceLabel: true,
      angleLabel: true,
      snapFeature: true,
      roverIcon: true,
      waypointPreview: true
    };

    window.isManualConnectionMode = false;
    window.isMeasureToolActive = false;
    window.isPointToolActive = false;

    window.calculateBearing = function(lat1, lon1, lat2, lon2) {
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const lat1Rad = lat1 * Math.PI / 180;
      const lat2Rad = lat2 * Math.PI / 180;
      const y = Math.sin(dLon) * Math.cos(lat2Rad);
      const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
      let bearing = Math.atan2(y, x) * 180 / Math.PI;
      return (bearing + 360) % 360;
    };

    window.getSnappedAngle = function(bearing) {
      for (const angle of window.ORTHO_ANGLES) {
        const diff = Math.abs(bearing - angle);
        if (diff < window.ORTHO_SNAP_THRESHOLD || diff > 360 - window.ORTHO_SNAP_THRESHOLD) {
          return angle;
        }
      }
      return null;
    };

    window.calculatePointAtBearing = function(lat, lon, bearing, distanceMeters) {
      const R = 6371000;
      const lat1 = lat * Math.PI / 180;
      const lon1 = lon * Math.PI / 180;
      const brng = bearing * Math.PI / 180;
      const d = distanceMeters / R;

      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
      const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));

      return { lat: lat2 * 180 / Math.PI, lng: lon2 * 180 / Math.PI };
    };

    window.updateOrthoGuide = function(currentLatLng) {
      if (!window.orthoGuideState?.lastWaypoint) return;
      if (!window.mapVisualization?.snapFeature) { window.clearOrthoGuide(); return; }
      const lastWp = window.orthoGuideState.lastWaypoint;
      const bearing = window.calculateBearing(lastWp.lat, lastWp.lon, currentLatLng.lat, currentLatLng.lng);
      const snappedAngle = window.getSnappedAngle(bearing);
      const dist = vincentyDistanceJS(lastWp.lat, lastWp.lon, currentLatLng.lat, currentLatLng.lng);
      const isSnapped = snappedAngle !== null;
      const targetAngle = isSnapped ? snappedAngle : bearing;
      const endLatLng = window.calculatePointAtBearing(lastWp.lat, lastWp.lon, targetAngle, dist);
      const color = isSnapped ? '#10b981' : '#3B82F6';
      const opacity = isSnapped ? 0.9 : 0.4;

      map.getSource('ortho-guide')?.setData({
        type:'Feature',
        geometry:{ type:'LineString', coordinates:[[lastWp.lon,lastWp.lat],[endLatLng.lng,endLatLng.lat]] }
      });
      map.setPaintProperty('ortho-guide-line','line-color', color);
      map.setPaintProperty('ortho-guide-line','line-opacity', opacity);

      if (window.mapVisualization?.angleLabel) {
        const midLat = (lastWp.lat + endLatLng.lat) / 2;
        const midLng = (lastWp.lon + endLatLng.lng) / 2;
        const labelHtml = \`<div style="background:\${isSnapped?'rgba(16,185,129,0.95)':'rgba(59,130,246,0.85)'};color:white;padding:4px 8px;border-radius:4px;font-size:\${isSnapped?12:11}px;font-weight:\${isSnapped?700:600};border:\${isSnapped?2:1}px solid \${isSnapped?'rgba(16,185,129,0.8)':'rgba(59,130,246,0.6)'};white-space:nowrap;font-family:monospace;display:inline-block;min-width:50px;text-align:center;">\${targetAngle.toFixed(isSnapped?0:1)}°</div>\`;
        if (!window.orthoGuideState._labelEl) {
          window.orthoGuideState._labelEl = document.createElement('div');
          window.orthoGuideState._labelMarker = new mapboxgl.Marker({ element: window.orthoGuideState._labelEl, anchor:'center' })
            .setLngLat([midLng, midLat]).addTo(map);
        }
        window.orthoGuideState._labelEl.innerHTML = labelHtml;
        window.orthoGuideState._labelEl.style.display = 'block';
        window.orthoGuideState._labelMarker.setLngLat([midLng, midLat]);
      }
      window.orthoGuideState.isActive = true;
    };

    window.clearOrthoGuide = function() {
      map.getSource('ortho-guide')?.setData(emptyLine());
      if (window.orthoGuideState?._labelEl) window.orthoGuideState._labelEl.style.display = 'none';
      if (window.orthoGuideState) { window.orthoGuideState.isActive = false; window.orthoGuideState.currentBearing = null; }
    };

    map.on('click', function(e) {
      if (window.orthoGuideState) window.orthoGuideState.lastWaypoint = null;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'mapClick', lat:e.lngLat.lat, lng:e.lngLat.lng }));
    });

    map.on('mousemove', function(e) {
      if (!window.orthoGuideState) return;
      if (window.isManualConnectionMode || window.isMeasureToolActive || !window.isPointToolActive) {
        window.clearOrthoGuide(); return;
      }
      const latlng = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      if (!window.orthoGuideState.isIntentionallyActivated && window.currentWaypoints?.length > 0) {
        const lastWp = window.currentWaypoints[window.currentWaypoints.length - 1];
        window.orthoGuideState.lastWaypoint = { lat: lastWp.lat, lon: lastWp.lon };
        window.updateOrthoGuide(latlng);
      } else if (window.orthoGuideState.isIntentionallyActivated && window.orthoGuideState.lastWaypoint) {
        window.updateOrthoGuide(latlng);
      }
      if (isDrawingModeActive && isMouseDown) addDrawingPoint(e.lngLat.lat, e.lngLat.lng);
    });

    map.on('mouseleave', function() {
      window.clearOrthoGuide?.();
    });

    map.on('zoomstart', function() { map.getCanvas().style.pointerEvents = 'none'; });
    map.on('zoomend', function() { map.getCanvas().style.pointerEvents = ''; });

    setTimeout(() => {
      const bounds = [];
      waypoints.forEach(wp => bounds.push([wp.lon, wp.lat]));
      if (roverData.hasPosition) bounds.push([roverData.lon, roverData.lat]);
      if (bounds.length > 0) {
        const b = new mapboxgl.LngLatBounds();
        bounds.forEach(coord => b.extend(coord));
        map.fitBounds(b, { padding: 50 });
      }
    }, 100);

    window.currentWaypoints = waypoints;

    function centerOnRover() {
      if (roverMarker) {
        const ll = roverMarker.getLngLat();
        map.flyTo({ center: [ll.lng, ll.lat], zoom: 22 });
      } else if (roverData.hasPosition) {
        map.flyTo({ center: [roverData.lon, roverData.lat], zoom: 22 });
      }
    }
    window.centerOnRover = centerOnRover;

    function toggleFullscreen() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TOGGLE_FULLSCREEN' }));
    }
    window.toggleFullscreen = toggleFullscreen;

    function fitToMission() {
      if (!window.currentWaypoints?.length) return;
      const b = new mapboxgl.LngLatBounds();
      window.currentWaypoints.forEach(wp => b.extend([wp.lon, wp.lat]));
      map.fitBounds(b, { padding: 50, animate: true });
    }
    window.fitToMission = fitToMission;

    function setMapStyle(styleName) {
      const styleUrl = styleName === 'dark'
        ? '${MAPBOX_STYLE_DARK}'
        : (styleName === 'streets' ? '${MAPBOX_STYLE_STREETS}' : '${MAPBOX_STYLE_SATELLITE}');
      map.setStyle(styleUrl);
    }
    window.setMapStyle = setMapStyle;

    let isDrawingModeActive = false;
    let drawingPoints = [];
    let lastDrawPoint = null;
    let drawingSpacing = 2;

    function enableDrawingMode(spacing) {
      isDrawingModeActive = true;
      drawingSpacing = spacing || 2;
      drawingPoints = [];
      lastDrawPoint = null;
      map.dragPan.disable();
      map.doubleClickZoom.disable();
      map.getCanvas().style.cursor = 'crosshair';
      map.getSource('drawing-path')?.setData(emptyLine());
    }

    function disableDrawingMode() {
      isDrawingModeActive = false;
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = '';
    }

    function finishDrawing() {
      if (drawingPoints.length > 0) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'drawingComplete',
          points: drawingPoints
        }));
      }
      drawingPoints = [];
      lastDrawPoint = null;
      disableDrawingMode();
    }

    function haversineDistanceJS(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }

    function vincentyDistanceJS(lat1, lon1, lat2, lon2) {
      const a = 6378137.0, f = 1/298.257223563, b = a*(1-f);
      const toRad = d => d * Math.PI / 180;
      const p1 = toRad(lat1), p2 = toRad(lat2), L = toRad(lon2 - lon1);
      const U1 = Math.atan((1-f)*Math.tan(p1)), U2 = Math.atan((1-f)*Math.tan(p2));
      const sU1 = Math.sin(U1), cU1 = Math.cos(U1);
      const sU2 = Math.sin(U2), cU2 = Math.cos(U2);
      if (Math.abs(lat1-lat2)<1e-12 && Math.abs(lon1-lon2)<1e-12) return 0;
      let lam = L, lamP, sS, cS, sig, sA, c2A, c2SM, C;
      for (let i=0; i<200; i++) {
        const sL=Math.sin(lam), cL=Math.cos(lam);
        sS=Math.sqrt((cU2*sL)**2+(cU1*sU2-sU1*cU2*cL)**2);
        if (sS===0) return 0;
        cS=sU1*sU2+cU1*cU2*cL; sig=Math.atan2(sS,cS);
        sA=(cU1*cU2*sL)/sS; c2A=1-sA*sA;
        c2SM=c2A!==0?cS-(2*sU1*sU2)/c2A:0;
        C=(f/16)*c2A*(4+f*(4-3*c2A));
        lamP=lam;
        lam=L+(1-C)*f*sA*(sig+C*sS*(c2SM+C*cS*(-1+2*c2SM*c2SM)));
        if (Math.abs(lam-lamP)<1e-12) {
          const u2=c2A*(a*a-b*b)/(b*b);
          const A=1+(u2/16384)*(4096+u2*(-768+u2*(320-175*u2)));
          const B=(u2/1024)*(256+u2*(-128+u2*(74-47*u2)));
          const dS=B*sS*(c2SM+(B/4)*(cS*(-1+2*c2SM*c2SM)-(B/6)*c2SM*(-3+4*sS*sS)*(-3+4*c2SM*c2SM)));
          return b*A*(sig-dS);
        }
      }
      return haversineDistanceJS(lat1, lon1, lat2, lon2);
    }

    function formatDistanceLabel(meters) {
      if (meters < 1000) return meters.toFixed(1) + ' m';
      return (meters / 1000).toFixed(2) + ' km';
    }

    function calculateBearing(lat1, lon1, lat2, lon2) {
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const lat1Rad = lat1 * Math.PI / 180;
      const lat2Rad = lat2 * Math.PI / 180;
      const y = Math.sin(dLon) * Math.cos(lat2Rad);
      const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
      let bearing = Math.atan2(y, x) * 180 / Math.PI;
      return (bearing + 360) % 360;
    }

    window.dragPreviewState = {
      _prevLabelEl: null, _prevLabelMarker: null,
      _nextLabelEl: null, _nextLabelMarker: null,
      _prevAngleLabelEl: null, _prevAngleLabelMarker: null,
      _nextAngleLabelEl: null, _nextAngleLabelMarker: null,
      draggingWpIndex: -1, isDragging: false
    };

    function clearDragPreview() {
      map.getSource('drag-prev')?.setData(emptyLine());
      map.getSource('drag-next')?.setData(emptyLine());
      const s = window.dragPreviewState;
      if (s._prevLabelEl) s._prevLabelEl.style.display = 'none';
      if (s._nextLabelEl) s._nextLabelEl.style.display = 'none';
      if (s._prevAngleLabelEl) s._prevAngleLabelEl.style.display = 'none';
      if (s._nextAngleLabelEl) s._nextAngleLabelEl.style.display = 'none';
      s.isDragging = false; s.draggingWpIndex = -1;
    }

    function updateDragPreview(dragLatLng, wpIndex, allWaypoints) {
      const s = window.dragPreviewState;
      const prevWp = wpIndex > 0 ? allWaypoints[wpIndex-1] : null;
      const nextWp = wpIndex < allWaypoints.length-1 ? allWaypoints[wpIndex+1] : null;

      function ensureLabelMarker(elKey, markerKey) {
        if (!s[elKey]) {
          s[elKey] = document.createElement('div');
          s[markerKey] = new mapboxgl.Marker({ element: s[elKey], anchor:'center' }).setLngLat([0,0]).addTo(map);
        }
      }

      if (prevWp) {
        map.getSource('drag-prev')?.setData({ type:'Feature', geometry:{ type:'LineString',
          coordinates:[[prevWp.lon,prevWp.lat],[dragLatLng.lng,dragLatLng.lat]] } });
        const dist = vincentyDistanceJS(prevWp.lat, prevWp.lon, dragLatLng.lat, dragLatLng.lng);
        const bearing = calculateBearing(prevWp.lat, prevWp.lon, dragLatLng.lat, dragLatLng.lng);
        const midLng = (prevWp.lon + dragLatLng.lng) / 2;
        const midLat = (prevWp.lat + dragLatLng.lat) / 2;
        if (window.mapVisualization?.distanceLabel) {
          ensureLabelMarker('_prevLabelEl','_prevLabelMarker');
          s._prevLabelEl.innerHTML = \`<div style="background:rgba(30,41,59,0.92);color:#67e8f9;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;border:1px solid rgba(103,232,249,0.4);white-space:nowrap;font-family:monospace;">\${formatDistanceLabel(dist)}</div>\`;
          s._prevLabelEl.style.display = 'block';
          s._prevLabelMarker.setLngLat([midLng, midLat]);
        } else if (s._prevLabelEl) s._prevLabelEl.style.display = 'none';
        if (window.mapVisualization?.angleLabel) {
          ensureLabelMarker('_prevAngleLabelEl','_prevAngleLabelMarker');
          s._prevAngleLabelEl.innerHTML = \`<div style="background:rgba(34,197,94,0.92);color:white;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;border:1px solid rgba(34,197,94,0.6);white-space:nowrap;font-family:monospace;">\${bearing.toFixed(1)}°</div>\`;
          s._prevAngleLabelEl.style.display = 'block';
          const dLat = dragLatLng.lat - prevWp.lat; const dLng = dragLatLng.lng - prevWp.lon;
          const off = Math.max(0.12, Math.min(0.08, 50/Math.max(dist,50)));
          s._prevAngleLabelMarker.setLngLat([midLng + dLat*off, midLat + (-dLng)*off]);
        } else if (s._prevAngleLabelEl) s._prevAngleLabelEl.style.display = 'none';
      }

      if (nextWp) {
        map.getSource('drag-next')?.setData({ type:'Feature', geometry:{ type:'LineString',
          coordinates:[[dragLatLng.lng,dragLatLng.lat],[nextWp.lon,nextWp.lat]] } });
        const dist = vincentyDistanceJS(dragLatLng.lat, dragLatLng.lng, nextWp.lat, nextWp.lon);
        const bearing = calculateBearing(dragLatLng.lat, dragLatLng.lng, nextWp.lat, nextWp.lon);
        const midLng = (dragLatLng.lng + nextWp.lon) / 2;
        const midLat = (dragLatLng.lat + nextWp.lat) / 2;
        if (window.mapVisualization?.distanceLabel) {
          ensureLabelMarker('_nextLabelEl','_nextLabelMarker');
          s._nextLabelEl.innerHTML = \`<div style="background:rgba(30,41,59,0.92);color:#67e8f9;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;border:1px solid rgba(103,232,249,0.4);white-space:nowrap;font-family:monospace;">\${formatDistanceLabel(dist)}</div>\`;
          s._nextLabelEl.style.display = 'block';
          s._nextLabelMarker.setLngLat([midLng, midLat]);
        } else if (s._nextLabelEl) s._nextLabelEl.style.display = 'none';
        if (window.mapVisualization?.angleLabel) {
          ensureLabelMarker('_nextAngleLabelEl','_nextAngleLabelMarker');
          s._nextAngleLabelEl.innerHTML = \`<div style="background:rgba(34,197,94,0.92);color:white;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;border:1px solid rgba(34,197,94,0.6);white-space:nowrap;font-family:monospace;">\${bearing.toFixed(1)}°</div>\`;
          s._nextAngleLabelEl.style.display = 'block';
          const dLat2 = nextWp.lat - dragLatLng.lat; const dLng2 = nextWp.lon - dragLatLng.lng;
          const off2 = Math.max(0.12, Math.min(0.08, 50/Math.max(dist,50)));
          s._nextAngleLabelMarker.setLngLat([midLng + dLat2*off2, midLat + (-dLng2)*off2]);
        } else if (s._nextAngleLabelEl) s._nextAngleLabelEl.style.display = 'none';
      }
    }

    function addDrawingPoint(lat, lng) {
      if (lastDrawPoint) {
        const dist = haversineDistanceJS(lastDrawPoint.lat, lastDrawPoint.lng, lat, lng);
        if (dist < drawingSpacing) return;
      }
      drawingPoints.push({ lat, lng });
      lastDrawPoint = { lat, lng };
      map.getSource('drawing-path')?.setData({ type:'Feature', geometry:{ type:'LineString',
        coordinates: drawingPoints.filter(p=>!isNaN(p.lat)).map(p=>[p.lng,p.lat]) } });
    }

    let isMouseDown = false;

    map.on('mousedown', function(e) {
      if (!isDrawingModeActive) return;
      isMouseDown = true;
      addDrawingPoint(e.lngLat.lat, e.lngLat.lng);
    });

    map.on('mouseup', function() {
      if (!isDrawingModeActive) return;
      isMouseDown = false;
      if (drawingPoints.length > 0) {
        drawingPoints.push({ lat: NaN, lng: NaN });
        lastDrawPoint = null;
      }
    });

    map.on('dblclick', function(e) {
      if (isDrawingModeActive) {
        e.preventDefault();
        finishDrawing();
      }
    });

    window.enableDrawingMode = enableDrawingMode;
    window.disableDrawingMode = disableDrawingMode;
    window.finishDrawing = finishDrawing;

    map.on('load', function() {
      map.addSource('mission-path', { type:'geojson', data:emptyLine() });
      map.addLayer({ id:'mission-glow', type:'line', source:'mission-path',
        paint:{'line-color':'#f97316','line-width':6,'line-opacity':0.2},
        layout:{'line-cap':'round','line-join':'round'} });
      map.addLayer({ id:'mission-line', type:'line', source:'mission-path',
        paint:{'line-color':'#f97316','line-width':2.5,'line-opacity':0.9},
        layout:{'line-cap':'round','line-join':'round'} });
      // Emlid-style black waypoint dots — a circle layer renders one dot at every
      // vertex of the existing mission-path LineString (no new source/data needed).
      map.addLayer({ id:'mission-points', type:'circle', source:'mission-path',
        paint:{
          'circle-radius':['interpolate',['linear'],['zoom'],12,3,18,6],
          'circle-color':'#000000',
          'circle-stroke-width':1.5,
          'circle-stroke-color':'#ffffff'
        } });
      ensureDxfEntityLayers();

      map.addSource('ortho-guide', { type:'geojson', data:emptyLine() });
      map.addLayer({ id:'ortho-guide-line', type:'line', source:'ortho-guide',
        paint:{'line-color':'#10b981','line-width':3,'line-opacity':0.9,'line-dasharray':[8,4]} });

      map.addSource('drag-prev', { type:'geojson', data:emptyLine() });
      map.addLayer({ id:'drag-prev-line', type:'line', source:'drag-prev',
        paint:{'line-color':'#3B82F6','line-width':3,'line-opacity':0.9,'line-dasharray':[6,4]} });
      map.addSource('drag-next', { type:'geojson', data:emptyLine() });
      map.addLayer({ id:'drag-next-line', type:'line', source:'drag-next',
        paint:{'line-color':'#3B82F6','line-width':3,'line-opacity':0.9,'line-dasharray':[6,4]} });

      map.addSource('drag-conn', { type:'geojson', data:emptyLine() });
      map.addLayer({ id:'drag-conn-line', type:'line', source:'drag-conn',
        paint:{'line-color':'#60A5FA','line-width':4,'line-opacity':0.8,'line-dasharray':[8,4]} });

      map.addSource('drawing-path', { type:'geojson', data:emptyLine() });
      map.addLayer({ id:'drawing-line', type:'line', source:'drawing-path',
        paint:{'line-color':'#22c55e','line-width':3,'line-opacity':0.8} });

      map.addSource('measure-line', { type:'geojson', data:emptyLine() });
      map.addLayer({ id:'measure-line-layer', type:'line', source:'measure-line',
        paint:{'line-color':'#f59e0b','line-width':2,'line-opacity':0.9,'line-dasharray':[6,4]} });

      setTimeout(() => {
        window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'mapReady' }));
      }, 500);
    });
  </script>
</body>
</html>
    `;
  }, []);

  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;

    if (isVisible) {
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
          } catch(e) {}
        })();
        true;
      `);
    } else {
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            if (typeof map !== 'undefined' && map) {
              map.dragPan.disable();
              map.touchZoomRotate.disable();
              map.doubleClickZoom.disable();
              map.scrollZoom.disable();
            }
          } catch(e) {}
        })();
        true;
      `);
    }
  }, [isVisible, mapReady]);

  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;

    const waypointsKey =
      waypoints.map((wp) => `${wp.id}-${wp.lat}-${wp.lon}`).join("|") +
      `|manualMode:${isManualConnectionMode}|manualConns:${manualConnections.join(",")}|connMode:${manualConnectionMode}|pointTool:${activeDrawingTool === "line"}`;

    if (
      waypointsKey === lastWaypointsRef.current &&
      lastWaypointsRef.current !== ""
    )
      return;
    lastWaypointsRef.current = waypointsKey;

    const waypointsData = JSON.stringify(
      waypoints.map((wp, idx) => ({
        id: wp.id,
        lat: wp.lat,
        lon: wp.lon,
        alt: wp.alt,
        block: wp.block,
        row: wp.row,
        pile: wp.pile,
        isSelected: false,
        isStart: idx === 0,
      })),
    );

    const manualConnectionsData = JSON.stringify(manualConnections);

    const updateWaypointsScript = `
      (function() {
        const newWaypoints = ${waypointsData};
        const isManualMode = ${isManualConnectionMode};
        const isPointToolActive = ${activeDrawingTool === "line"};
        const manualConnections = ${manualConnectionsData};
        const connectionMode = ${JSON.stringify(manualConnectionMode)};

        window.isPointToolActive = isPointToolActive;
        window.currentWaypoints = newWaypoints;

        if (!window.dragConnectionState) {
          window.dragConnectionState = {
            isDragging: false,
            startWaypointId: null,
            startLatLng: null,
            tempLine: null,
            tempIndicator: null,
            waypoints: [],
            connections: [],
            localConnections: [],
            isManualMode: false,
            connectionMode: 'tap'
          };
        }

        window.dragConnectionState.waypoints = newWaypoints;
        window.dragConnectionState.connections = manualConnections;
        if (!window.dragConnectionState.isDragging) {
          window.dragConnectionState.localConnections = [...manualConnections];
        }
        window.dragConnectionState.isManualMode = isManualMode;
        window.dragConnectionState.connectionMode = connectionMode;

        if (!window.dragListenersAdded) {
          window.dragListenersAdded = true;

          const startDrag = function(latlng, containerPoint) {
            const state = window.dragConnectionState;
            if (!state.isManualMode || state.connectionMode !== 'drag') return;
            if (state.waypoints && state.waypoints.length > 0) {
              let closest = null;
              let minD = 40;
              for (const wp of state.waypoints) {
                const wpPoint = map.project([wp.lon, wp.lat]);
                const d = Math.hypot(containerPoint.x - wpPoint.x, containerPoint.y - wpPoint.y);
                if (d < minD) {
                  minD = d;
                  closest = wp;
                }
              }
              if (closest) {
                state.isDragging = true;
                state.startWaypointId = closest.id;
                state.startLatLng = { lat: closest.lat, lng: closest.lon };
                if (!state.localConnections.includes(closest.id)) {
                  state.localConnections.push(closest.id);
                }
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'waypointConnect',
                  fromId: closest.id,
                  toId: closest.id
                }));
              }
            }
          };

          const updateDragVisuals = function(e) {
            if (window.dragConnectionState.isDragging && window.dragConnectionState.startLatLng) {
              const latlng = e.lngLat;
              const currentPoint = map.project([latlng.lng, latlng.lat]);
              const startPoint = map.project([window.dragConnectionState.startLatLng.lng, window.dragConnectionState.startLatLng.lat]);
              const dragDistance = Math.hypot(currentPoint.x - startPoint.x, currentPoint.y - startPoint.y);
              if (dragDistance > 10) {
                if (window.dragConnectionState.waypoints && window.dragConnectionState.waypoints.length > 0) {
                  const conns = window.dragConnectionState.localConnections;
                  for (const wp of window.dragConnectionState.waypoints) {
                    if (wp.id === window.dragConnectionState.startWaypointId) continue;
                    if (conns.includes(wp.id)) continue;
                    const wpPoint = map.project([wp.lon, wp.lat]);
                    const distToWp = Math.hypot(currentPoint.x - wpPoint.x, currentPoint.y - wpPoint.y);
                    if (distToWp < 40) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'waypointConnect',
                        fromId: window.dragConnectionState.startWaypointId,
                        toId: wp.id
                      }));
                      window.dragConnectionState.localConnections.push(wp.id);
                      window.dragConnectionState.startWaypointId = wp.id;
                      window.dragConnectionState.startLatLng = { lat: wp.lat, lng: wp.lon };
                      if (window.dragConnectionState.tempLine) {
                        window.dragConnectionState.tempLine.remove();
                        window.dragConnectionState.tempLine = null;
                      }
                      return;
                    }
                  }
                }
              }
              if (window.dragConnectionState.tempLine) {
                window.dragConnectionState.tempLine.remove();
              }
              const el = document.createElement('div');
              el.style.cssText = 'width:24px;height:24px;border-radius:50%;background:rgba(96,165,250,0.5);border:2px solid #60A5FA;';
              window.dragConnectionState.tempLine = new mapboxgl.Marker({ element:el, anchor:'center' })
                .setLngLat([latlng.lng, latlng.lat]).addTo(map);
            }
          };

          const clearDragVisuals = function() {
            if (window.dragConnectionState.tempLine) {
              window.dragConnectionState.tempLine.remove();
              window.dragConnectionState.tempLine = null;
            }
            window.dragConnectionState.isDragging = false;
            window.dragConnectionState.startWaypointId = null;
          };

          map.on('mousemove', updateDragVisuals);
          map.on('mousedown', function(e) {
            startDrag(e.lngLat, map.project([e.lngLat.lng, e.lngLat.lat]));
          });
          map.on('mouseup', function() {
            setTimeout(clearDragVisuals, 800);
          });

          var container = map.getContainer();
          container.addEventListener('touchstart', function(e) {
            if (e.touches && e.touches[0]) {
              var touch = e.touches[0];
              var rect = container.getBoundingClientRect();
              var point = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
              var latlng = map.unproject([point.x, point.y]);
              startDrag(latlng, point);
            }
          }, { passive: true });

          container.addEventListener('touchmove', function(e) {
            var state = window.dragConnectionState;
            if (!state || !state.isDragging) return;
            e.preventDefault();
            if (e.touches && e.touches[0]) {
              var touch = e.touches[0];
              var rect = container.getBoundingClientRect();
              var point = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
              var latlng = map.unproject([point.x, point.y]);
              updateDragVisuals({ lngLat: latlng });
            }
          }, { passive: false });

          container.addEventListener('touchend', function() {
            setTimeout(clearDragVisuals, 800);
          });
        }

        if (isManualMode && connectionMode === 'drag') {
          map.dragPan.disable();
        } else {
          map.dragPan.enable();
        }

        if (isManualMode) {
          waypointMarkers.forEach(function(m) { m.remove(); });
          waypointMarkers.length = 0;
          markerRegistry.clear();

          map.getSource('mission-path')?.setData(emptyLine());

          if (manualConnections.length > 1) {
            const connectedWaypoints = manualConnections.map(id =>
              newWaypoints.find(wp => wp.id === id)
            ).filter(wp => wp !== undefined);
            if (connectedWaypoints.length > 1) {
              const pathCoords = connectedWaypoints.map(wp => [wp.lon, wp.lat]);
              map.getSource('mission-path')?.setData({
                type:'Feature',
                geometry:{ type:'LineString', coordinates: pathCoords }
              });
            }
          }

          newWaypoints.forEach(function(wp, index) {
            const isConnected = manualConnections.includes(wp.id);
            const connectionIndex = manualConnections.indexOf(wp.id);
            let el;
            if (isConnected) {
              el = document.createElement('div');
              el.innerHTML = \`<div style="position: relative;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="#4ADE80"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><text x="12" y="10.5" font-family="sans-serif" font-size="12" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">\${wp.id}</text></svg><div style="position: absolute; top: -12px; right: -12px; background: #22c55e; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: bold; border: 2px solid white; z-index: 1000;">\${connectionIndex + 1}</div></div>\`;
            } else {
              const fill = wp.isStart ? '#16a34a' : '#f97316';
              const size = 36;
              el = document.createElement('div');
              el.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="\${size}" height="\${size}" fill="\${fill}"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" style="stroke:rgba(0,0,0,0.3);stroke-width:0.5;"/><text x="12" y="10.5" font-family="sans-serif" font-size="12" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">\${index + 1}</text></svg>\`;
            }
            const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom', draggable: false })
              .setLngLat([wp.lon, wp.lat]).addTo(map);
            if (connectionMode === 'tap' || connectionMode === 'pan') {
              el.addEventListener('click', function(e) {
                e.stopPropagation();
                if (window.orthoGuideState) {
                  window.orthoGuideState.lastWaypoint = { lat: wp.lat, lon: wp.lon };
                  window.orthoGuideState.isIntentionallyActivated = true;
                }
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'waypointClick', id: wp.id }));
              });
            }
            markerRegistry.set(wp.id, marker);
            waypointMarkers.push(marker);
          });
        } else {
          if (markerRegistry.size === 0 && newWaypoints.length > 50) {
            chunkedLoad(newWaypoints);
          } else {
            diffAndUpdate(newWaypoints);
          }
        }

        if (connectionMode !== 'drag') {
          if (window.dragConnectionState && window.dragConnectionState.tempLine) {
            window.dragConnectionState.tempLine.remove();
            window.dragConnectionState.tempLine = null;
            window.dragConnectionState.isDragging = false;
          }
        }
          if (newWaypoints.length === 1) {
  map.flyTo({
    center: [
      newWaypoints[0].lon,
      newWaypoints[0].lat
    ],
    zoom: 21,
    animate: false
  });
} else if (newWaypoints.length > 1) {
  const bounds = new mapboxgl.LngLatBounds();

  newWaypoints.forEach(function(wp) {
    bounds.extend([wp.lon, wp.lat]);
  });

  map.fitBounds(bounds, {
    padding: 80,
    maxZoom: 22,
    animate: false
  });
}
      })();
      true;
    `;

    webViewRef.current.injectJavaScript(updateWaypointsScript);
  }, [
    waypoints,
    mapReady,
    isManualConnectionMode,
    manualConnections,
    manualConnectionMode,
    activeDrawingTool,
  ]);

  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;

    const featureCollection = {
      type: "FeatureCollection",
      features: dxfEntities
        .filter((entity) => entity.coordinates.length > 0)
        .map((entity) => {
          const first = entity.coordinates[0];
          const isLine =
            entity.kind === "line" && entity.coordinates.length > 1;

          return {
            type: "Feature",
            properties: {
              id: entity.id,
              kind: entity.kind,
              layer: entity.layer ?? "",
              label: entity.label,
              dashed: !!entity.dashed,
              closedRing: !!entity.closedRing,
            },
            geometry: isLine
              ? {
                  type: "LineString",
                  coordinates: entity.coordinates.map((coord) => [
                    coord.lon,
                    coord.lat,
                  ]),
                }
              : {
                  type: "Point",
                  coordinates: [first.lon, first.lat],
                },
          };
        }),
    };

    const dxfEntitiesKey = JSON.stringify(featureCollection);
    if (dxfEntitiesKey === lastDxfEntitiesRef.current) return;
    lastDxfEntitiesRef.current = dxfEntitiesKey;

    const updateDxfEntitiesScript = `
      (function() {
        const data = ${dxfEntitiesKey};
        window.currentDxfEntitiesGeoJson = data;
        const src = map.getSource('dxf-entities');
        if (src) src.setData(data);
      })();
      true;
    `;

    webViewRef.current.injectJavaScript(updateDxfEntitiesScript);
  }, [dxfEntities, mapReady]);

  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;
    if (lastWaypointsRef.current === "") return;

    const prev = lastSelectedRef.current;
    const next = selectedWaypoint ?? null;
    lastSelectedRef.current = next;

    const selectionScript = `
      (function() {
        if (!window.currentWaypoints) return;
        if (${prev} !== null) {
          const prevIdx = window.currentWaypoints.findIndex(function(w) { return w.id === ${prev}; });
          if (prevIdx !== -1 && waypointMarkers[prevIdx]) {
            const wp = window.currentWaypoints[prevIdx];
            const fill = prevIdx === 0 ? '#16a34a' : '#f97316';
            const size = 36;
            const svgIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="' + fill + '"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" style="stroke:rgba(0,0,0,0.3);stroke-width:0.5;"/><text x="12" y="10.5" font-family="sans-serif" font-size="12" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">' + (prevIdx + 1) + '</text></svg>';
            const el = waypointMarkers[prevIdx].getElement();
            if (el) {
              el.innerHTML = svgIcon;
              el.style.width = size + 'px';
              el.style.height = size + 'px';
            }
          }
        }
        if (${next} !== null) {
          const nextIdx = window.currentWaypoints.findIndex(function(w) { return w.id === ${next}; });
          if (nextIdx !== -1 && waypointMarkers[nextIdx]) {
            const size = 48;
            const svgIcon = '<div class="wp-selected-pulse"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="#3B82F6"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" style="stroke:rgba(0,0,0,0.3);stroke-width:0.5;"/><text x="12" y="10.5" font-family="sans-serif" font-size="12" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">' + (nextIdx + 1) + '</text></svg></div>';
            const el = waypointMarkers[nextIdx].getElement();
            if (el) {
              el.innerHTML = svgIcon;
              el.style.width = size + 'px';
              el.style.height = size + 'px';
            }
          }
        }
      })();
      true;
    `;
    webViewRef.current.injectJavaScript(selectionScript);
  }, [selectedWaypoint, mapReady]);

  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;

    if (isDrawingMode && drawSettings) {
      const enableScript = `
        window.enableDrawingMode(${drawSettings.waypointSpacing});
        true;
      `;
      webViewRef.current.injectJavaScript(enableScript);
    } else {
      const disableScript = `
        if (window.disableDrawingMode) window.disableDrawingMode();
        true;
      `;
      webViewRef.current.injectJavaScript(disableScript);
    }
  }, [isDrawingMode, drawSettings, mapReady]);

  useEffect(() => {
    if (!mapReady || !webViewRef.current || !visualization) return;

    const updateVisualizationScript = `
      window.mapVisualization = {
        distanceLabel: ${visualization.distanceLabel},
        angleLabel: ${visualization.angleLabel},
        snapFeature: ${visualization.snapFeature},
        roverIcon: ${visualization.roverIcon},
        waypointPreview: ${visualization.waypointPreview}
      };

      window.isManualConnectionMode = ${isManualConnectionMode};

      if (window.orthoGuideState) {
        if (!window.mapVisualization.snapFeature || window.isManualConnectionMode) {
          if (window.clearOrthoGuide) window.clearOrthoGuide();
        }
      }

      if (typeof roverMarker !== 'undefined' && roverMarker) {
        roverMarker.getElement().style.opacity = window.mapVisualization.roverIcon ? '1' : '0';
      }

      if (typeof waypointMarkers !== 'undefined' && waypointMarkers && waypointMarkers.length > 0) {
        waypointMarkers.forEach(marker => {
          if (marker && marker.getElement()) {
            marker.getElement().style.opacity = window.mapVisualization.waypointPreview ? '1' : '0';
          }
        });
      }

      if (typeof window.dragPreviewState !== 'undefined') {
        window.dragPreviewState.showDistanceLabel = window.mapVisualization.distanceLabel;
        window.dragPreviewState.showAngleLabel = window.mapVisualization.angleLabel;
      }

      true;
    `;

    webViewRef.current.injectJavaScript(updateVisualizationScript);
  }, [visualization, mapReady, isManualConnectionMode]);

  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;
    const isMeasureActive = activeDrawingTool === "measure";
    const isPointToolActive = activeDrawingTool === "line";
    const shouldEnableDrag = isPointToolActive && !isManualConnectionMode;
    const script = `
      window.isMeasureToolActive = ${isMeasureActive};
      window.isPointToolActive = ${isPointToolActive};
      markerRegistry.forEach(function(marker, id) {
        if (${shouldEnableDrag}) {
          marker.setDraggable(true);
          if (!marker._dragHandlersAttached) {
            marker._dragHandlersAttached = true;
            marker.on('dragstart', function(e) {
              window.dragPreviewState.isDragging = true;
              var wpIdx = window.currentWaypoints.findIndex(function(w) { return w.id === id; });
              window.dragPreviewState.draggingWpIndex = wpIdx;
              map.setPaintProperty('mission-line','line-opacity',0.3);
              map.setPaintProperty('mission-glow','line-opacity',0.1);
            });
            marker.on('drag', function(e) {
              var ll = marker.getLngLat();
              var wpIdx = window.currentWaypoints.findIndex(function(w) { return w.id === id; });
              if (wpIdx !== -1) updateDragPreview({ lat: ll.lat, lng: ll.lng }, wpIdx, window.currentWaypoints);
            });
            marker.on('dragend', function(e) {
              clearDragPreview();
              window.clearOrthoGuide();
              map.setPaintProperty('mission-line','line-opacity',0.9);
              map.setPaintProperty('mission-glow','line-opacity',0.2);
              var ll = marker.getLngLat();
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'waypointDrag',
                id: id,
                lat: ll.lat,
                lng: ll.lng
              }));
            });
          }
        } else {
          marker.setDraggable(false);
        }
      });
      true;
    `;
    webViewRef.current.injectJavaScript(script);
  }, [activeDrawingTool, mapReady, isManualConnectionMode]);

  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;
    const pts = JSON.stringify(measurePoints);
    const script = `
      (function() {
        if (!window.measureMarkers) window.measureMarkers = [];
        window.measureMarkers.forEach(function(m) { m.remove(); });
        window.measureMarkers = [];
        map.getSource('measure-line')?.setData(emptyLine());

        var points = ${pts};
        if (!points || points.length === 0) return;

        points.forEach(function(pt) {
          const el = document.createElement('div');
          el.style.cssText = 'border:3px solid #f59e0b;border-radius:50%;width:30px;height:30px;box-shadow:0 0 8px rgba(245,158,11,0.8);background:rgba(245,158,11,0.15);pointer-events:none;';
          const marker = new mapboxgl.Marker({ element:el, anchor:'center' }).setLngLat([pt.lon, pt.lat]).addTo(map);
          window.measureMarkers.push(marker);
        });

        if (points.length === 2) {
          map.getSource('measure-line')?.setData({ type:'Feature', geometry:{ type:'LineString',
            coordinates:[[points[0].lon,points[0].lat],[points[1].lon,points[1].lat]] } });
        }
      })();
      true;
    `;
    webViewRef.current.injectJavaScript(script);
  }, [measurePoints, mapReady]);

  useEffect(() => {
    const loadMeasurePosition = async () => {
      try {
        const saved = await AsyncStorage.getItem("measureOverlayPos");
        if (saved) setMeasureOverlayPos(JSON.parse(saved));
      } catch (e) {}
    };
    loadMeasurePosition();
  }, []);

  useEffect(() => {
    const saveMeasurePosition = async () => {
      try {
        await AsyncStorage.setItem(
          "measureOverlayPos",
          JSON.stringify(measureOverlayPos),
        );
      } catch (e) {}
    };
    saveMeasurePosition();
  }, [measureOverlayPos]);

  const widgetMenuItems = [
    {
      key: "drawingTools",
      label: "Drawing Tools",
      icon: "gesture-tap-button" as const,
      selected: isDrawingToolsVisible,
      onToggle: () => setIsDrawingToolsVisible?.(!isDrawingToolsVisible),
    },
    {
      key: "missionOps",
      label: "Mission Control",
      icon: "rocket-launch" as const,
      selected: isMissionOpsVisible,
      onToggle: () => setIsMissionOpsVisible?.(!isMissionOpsVisible),
    },
    {
      key: "statistics",
      label: "Mission Stats",
      icon: "chart-bar" as const,
      selected: isStatisticsVisible,
      onToggle: () => setIsStatisticsVisible?.(!isStatisticsVisible),
    },
    {
      key: "bottomTable",
      label: "Waypoints Table",
      icon: "table-large" as const,
      selected: isBottomTableVisible,
      onToggle: () => setIsBottomTableVisible?.(!isBottomTableVisible),
    },
    {
      key: "robotPosition",
      label: "Robot Position",
      icon: "robot" as const,
      selected: isRobotPositionVisible,
      onToggle: () => setIsRobotPositionVisible?.(!isRobotPositionVisible),
    },
  ];

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHTML }}
        originWhitelist={["*"]}
        mixedContentMode="always"
        allowFileAccess={true}
        style={{ flex: 1, backgroundColor: "#050a12" }}
        androidLayerType="hardware"
        onError={(event) => {
          console.error(
            "[PathPlanMap] WebView error:",
            event.nativeEvent.description,
          );
        }}
        onHttpError={(event) => {
          console.error(
            "[PathPlanMap] WebView HTTP error:",
            event.nativeEvent.statusCode,
            event.nativeEvent.url,
          );
        }}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === "mapReady") {
              console.log("[PathPlanMap] Map ready");
              setMapReady(true);
            } else if (message.type === "mapError") {
              console.error("[PathPlanMap] Mapbox error:", message.message);
            } else if (message.type === "mapClick") {
              onDismissPanel?.();
              onMapPress?.({ latitude: message.lat, longitude: message.lng });
              setContextMenu(null);
            } else if (message.type === "waypointClick") {
              if (activeDrawingTool === "measure") {
                onMeasureWaypointSelect?.(message.id);
              } else {
                onWaypointClick?.(message.id);
                // Drag is governed solely by the Points-tool effect (see the
                // window.isPointToolActive effect): markers are draggable only
                // while the Points tool is active. We deliberately do NOT enable
                // drag on click, which previously let a marker be dragged with
                // the tool off — the marker moved natively but handleWaypointDrag
                // rejected the update, leaving the connecting line stale.
              }
              setContextMenu(null);
            } else if (message.type === "waypointConnect") {
              onWaypointConnect?.(message.fromId, message.toId);
            } else if (message.type === "waypointDrag") {
              onWaypointDrag?.(message.id, {
                latitude: message.lat,
                longitude: message.lng,
              });
            } else if (message.type === "waypointContextMenu") {
              if (activeDrawingTool === "measure") return;
              if (!isManualConnectionMode || manualConnectionMode === "pan") {
                setContextMenu({
                  x: message.x,
                  y: message.y,
                  waypointId: message.id,
                });
              }
            } else if (message.type === "drawingComplete") {
              const coords = message.points
                .filter((p: any) => !isNaN(p.lat) && !isNaN(p.lng))
                .map((p: any) => ({ latitude: p.lat, longitude: p.lng }));
              if (coords.length > 0) onDrawingComplete?.(coords);
            } else if (message.type === "mapStyleChanged") {
              lastWaypointsRef.current = "";
              setMapReady(true);
            }
          } catch (error) {
            console.error("WebView message error:", error);
          }
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={false}
      />

      {/* Bottom Horizontal Controls Capsule Bar */}
      <View style={styles.bottomControlsBar}>
        {/* Toggle Map Style */}
        <TouchableOpacity
          style={styles.bottomControlBtn}
          onPress={() => {
            // Cycle: satellite (default) → streets → dark → satellite
            const order: Array<"satellite" | "streets" | "dark"> = [
              "satellite",
              "streets",
              "dark",
            ];
            const newStyle =
              order[(order.indexOf(mapStyle) + 1) % order.length];
            setMapStyle(newStyle);
            webViewRef.current?.injectJavaScript(
              `window.setMapStyle('${newStyle}'); true;`,
            );
          }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name={
              mapStyle === "satellite"
                ? "image-filter-hdr"
                : mapStyle === "streets"
                  ? "road-variant"
                  : "earth"
            }
            size={18}
            color="#E5F1FF"
          />
        </TouchableOpacity>

        <View style={styles.btnDivider} />

        {/* Fit Mission */}
        <TouchableOpacity
          style={styles.bottomControlBtn}
          onPress={() =>
            webViewRef.current?.injectJavaScript("window.fitToMission(); true;")
          }
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="vector-polyline"
            size={18}
            color="#E5F1FF"
          />
        </TouchableOpacity>

        <View style={styles.btnDivider} />

        {/* Center on Rover */}
        <TouchableOpacity
          style={styles.bottomControlBtn}
          onPress={() =>
            webViewRef.current?.injectJavaScript(
              "window.centerOnRover(); true;",
            )
          }
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="crosshairs-gps"
            size={18}
            color="#E5F1FF"
          />
        </TouchableOpacity>

        <View style={styles.btnDivider} />

        {/* Zoom In */}
        <TouchableOpacity
          style={styles.bottomControlBtn}
          onPress={() =>
            webViewRef.current?.injectJavaScript(
              'if (typeof map !== "undefined") { map.zoomIn(); } true;',
            )
          }
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="plus" size={18} color="#E5F1FF" />
        </TouchableOpacity>

        <View style={styles.btnDivider} />

        {/* Zoom Out */}
        <TouchableOpacity
          style={styles.bottomControlBtn}
          onPress={() =>
            webViewRef.current?.injectJavaScript(
              'if (typeof map !== "undefined") { map.zoomOut(); } true;',
            )
          }
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="minus" size={18} color="#E5F1FF" />
        </TouchableOpacity>
      </View>

      {/* Vis Menu Dropdown near Drawing Tools panel (Settings button lives there now) */}
      {isVisMenuOpen && visualization && (
        <View style={styles.visDropdownMenu}>
          <Text style={styles.visDropdownTitle}>MAP SETTINGS</Text>
          <View style={styles.visMenuList}>
            {MAP_SETTINGS_ITEMS.map((option) => {
              const isSelected = visualization[option.key];
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.visMenuItem,
                    isSelected && styles.visMenuItemSelected,
                  ]}
                  onPress={() => onVisualizationToggle?.(option.key)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={18}
                    color={isSelected ? "#67E8F9" : "#94A3B8"}
                    style={styles.visMenuItemIcon}
                  />
                  <Text
                    style={[
                      styles.visMenuItemLabel,
                      isSelected && styles.visMenuItemLabelSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Widget Menu Dropdown near Drawing Tools panel (Widget button lives there now) */}
      {isWidgetMenuOpen && (
        <View style={styles.visDropdownMenu}>
          <Text style={styles.visDropdownTitle}>WIDGET LAYERS</Text>
          <View style={styles.visMenuList}>
            {widgetMenuItems.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.visMenuItem,
                  option.selected && styles.visMenuItemSelected,
                ]}
                onPress={option.onToggle}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={option.icon}
                  size={18}
                  color={option.selected ? "#67E8F9" : "#94A3B8"}
                  style={styles.visMenuItemIcon}
                />
                <Text
                  style={[
                    styles.visMenuItemLabel,
                    option.selected && styles.visMenuItemLabelSelected,
                  ]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Sleek Rotating Compass Overlay — fixed N, rotating heading needle */}
      <View style={styles.compassOverlay}>
        <Text style={styles.compassN}>N</Text>
        <View
          style={[
            styles.headingNeedle,
            { transform: [{ rotate: `${heading ?? 0}deg` }] },
          ]}
        >
          <MaterialCommunityIcons name="navigation" size={26} color="#67E8F9" />
        </View>
        <View style={styles.compassPivot} />
      </View>

      {contextMenu && (
        <View
          style={{
            position: "absolute",
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: "rgba(13, 42, 75, 0.96)",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "rgba(59, 130, 246, 0.3)",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
            zIndex: 2000,
            minWidth: 180,
            overflow: "hidden",
          }}
        >
          {onDeleteWaypoint && (
            <TouchableOpacity
              onPress={() => {
                onDeleteWaypoint(contextMenu.waypointId);
                setContextMenu(null);
              }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(59, 130, 246, 0.15)",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                style={{ color: "#ef4444", fontSize: 14, fontWeight: "600" }}
              >
                Delete Waypoint
              </Text>
            </TouchableOpacity>
          )}
          {onInsertWaypoint &&
            roverPosition &&
            Number.isFinite(roverPosition.lat) &&
            Number.isFinite(roverPosition.lon) && (
              <TouchableOpacity
                onPress={() => {
                  onInsertWaypoint(contextMenu.waypointId, {
                    latitude: roverPosition.lat,
                    longitude: roverPosition.lon,
                  });
                  setContextMenu(null);
                }}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text
                  style={{ color: "#22c55e", fontSize: 14, fontWeight: "600" }}
                >
                  Insert Waypoint After
                </Text>
              </TouchableOpacity>
            )}
        </View>
      )}

      {measurePoints.length > 0 && (
        <View
          style={[
            styles.measureOverlay,
            { left: measureOverlayPos.x, top: measureOverlayPos.y },
          ]}
          {...measurePanResponderRef.current?.panHandlers}
        >
          <View style={styles.measureHeader}>
            <Text style={styles.measureTitle}>⬡ MEASURE</Text>
            <TouchableOpacity
              onPress={onMeasureClear}
              style={styles.measureClearBtn}
            >
              <Text style={styles.measureClearText}>✕</Text>
            </TouchableOpacity>
          </View>
          {measurePoints.map((pt, idx) => (
            <View key={idx} style={styles.measureRow}>
              <Text style={styles.measureSeq}>
                {pt.waypointId != null ? `WP${pt.waypointId}` : `M${pt.seq}`}
              </Text>
              <Text style={styles.measureCoord}>
                {pt.lat.toFixed(6)},{"\n"}
                {pt.lon.toFixed(6)}
              </Text>
            </View>
          ))}
          {measurePoints.length < 2 && (
            <Text style={styles.measureHint}>Tap an existing waypoint</Text>
          )}
          {measureResult && (
            <View style={styles.measureResultBlock}>
              <View style={styles.measureResultRow}>
                <Text style={styles.measureResultLabel}>Distance</Text>
                <Text style={styles.measureResultValue}>
                  {measureResult.distance >= 1000
                    ? `${(measureResult.distance / 1000).toFixed(3)} km`
                    : `${measureResult.distance.toFixed(2)} m`}
                </Text>
              </View>
              <View style={styles.measureResultRow}>
                <Text style={styles.measureResultLabel}>Heading</Text>
                <Text style={styles.measureResultValue}>
                  {measureResult.heading.toFixed(1)}°
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050a12",
  },
  bottomControlsBar: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 320,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#07111be6",
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.15)",
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  bottomControlBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  btnDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(103, 232, 249, 0.12)",
  },
  compassOverlay: {
    position: "absolute",
    bottom: 16,
    left: 16,
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: "#07111be6",
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  headingNeedle: {
    alignItems: "center",
    justifyContent: "center",
  },
  compassN: {
    position: "absolute",
    top: 4,
    fontSize: 9,
    fontWeight: "900",
    color: "#E5F1FF",
    letterSpacing: 0.5,
    zIndex: 2,
  },
  compassPivot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#0a1420",
    borderWidth: 1,
    borderColor: "#67E8F9",
    zIndex: 3,
  },
  measureOverlay: {
    position: "absolute",
    backgroundColor: "rgba(13, 42, 75, 0.95)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
    padding: 0,
    minWidth: 190,
    zIndex: 1000,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  measureHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(245, 158, 11, 0.15)",
  },
  measureTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#f59e0b",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  measureClearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(239,68,68,0.2)",
    borderRadius: 4,
  },
  measureClearText: {
    fontSize: 11,
    color: "#ef4444",
    fontWeight: "700",
  },
  measureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
    paddingHorizontal: 12,
  },
  measureSeq: {
    fontSize: 10,
    fontWeight: "700",
    color: "#f59e0b",
    width: 36,
    fontFamily: "monospace",
  },
  measureCoord: {
    fontSize: 10,
    color: "rgba(229, 241, 255, 0.7)",
    fontFamily: "monospace",
  },
  measureHint: {
    fontSize: 10,
    color: "rgba(103,232,249,0.7)",
    marginTop: 4,
    paddingHorizontal: 12,
    paddingBottom: 8,
    fontStyle: "italic",
  },
  measureResultBlock: {
    marginTop: 0,
    borderTopWidth: 1,
    borderTopColor: "rgba(245,158,11,0.2)",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(245, 158, 11, 0.05)",
  },
  measureResultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  measureResultLabel: {
    fontSize: 10,
    color: "rgba(229, 241, 255, 0.6)",
    fontFamily: "monospace",
  },
  measureResultValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#f59e0b",
    fontFamily: "monospace",
  },
  visDropdownMenu: {
    position: "absolute",
    left: PATH_PLAN_WIDGET_MENU_LEFT,
    top: PATH_PLAN_WIDGET_MENU_TOP,
    width: PATH_PLAN_WIDGET_MENU_WIDTH,
    height: PATH_PLAN_WIDGET_MENU_HEIGHT,
    backgroundColor: "#07111be6",
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.15)",
    borderRadius: 12,
    padding: 16,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  visDropdownTitle: {
    color: "#67E8F9",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    paddingBottom: 10,
  },
  visMenuList: {
    flex: 1,
    gap: 8,
  },
  visMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.1)",
    backgroundColor: "rgba(8, 16, 26, 0.9)",
    paddingHorizontal: 12,
  },
  visMenuItemSelected: {
    borderColor: "rgba(103, 232, 249, 0.55)",
    backgroundColor: "rgba(103, 232, 249, 0.14)",
  },
  visMenuItemIcon: {
    marginRight: 10,
  },
  visMenuItemLabel: {
    flex: 1,
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
  },
  visMenuItemLabelSelected: {
    color: "#67E8F9",
  },
});
