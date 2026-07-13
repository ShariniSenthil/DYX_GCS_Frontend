// ============================================================
// useCADAlignment Hook — CAD Georeferencing State Machine
// ============================================================
//
// Manages the full alignment workflow:
//   1. DXF file loaded → CAD model stored
//   2a. Manual: User selects 2 CAD points → enters 2 GPS coords → compute
//   2b. Auto: User presses Quick Align → uses rover position + North
//   3. Georeferencing pipeline runs
//   4. GeoEntity[] → PathPlanWaypoint[]
//   5. Ready for apply/cancel
//
// This hook is UI-agnostic. It manages state and data flow only.

import { useState, useCallback } from 'react';
import { CADModel, Point2D, GeoPoint, GeorefResult, Entity } from '../../core/geometry/types';
import { parseDXF } from '../../core/parser/dxfParser';
import { georeferenceCAD } from '../../core/georef/georeferenceService';
import { geoEntitiesToWaypoints, GeoToWaypointConfig } from '../adapters/geoToWaypoints';
import { PathPlanWaypoint } from '../../types/pathplan';
import { enuToLatLon, EARTH_RADIUS } from '../../core/geo/enu';

/** Alignment workflow states */
export type CADAlignmentState =
  | 'idle'              // No CAD model
  | 'cad_loaded'        // DXF parsed, showing canvas
  | 'points_selected'   // 2 CAD points selected, waiting for GPS
  | 'gps_entered'       // GPS coordinates entered, ready to compute
  | 'computed'          // Georeferencing done, waypoints ready
  | 'error';            // Error state

export type UseCADAlignmentReturn = {
  // State
  state: CADAlignmentState;
  cadModel: CADModel | null;
  cadPointA: Point2D | null;
  cadPointB: Point2D | null;
  geoPointA: GeoPoint | null;
  geoPointB: GeoPoint | null;
  computedWaypoints: PathPlanWaypoint[] | null;
  georefResult: GeorefResult | null;
  errorMessage: string | null;

  // Actions
  loadDXF: (content: string) => void;
  setCADPoints: (a: Point2D, b: Point2D) => void;
  setGPSPoints: (a: GeoPoint, b: GeoPoint) => void;
  computeAlignment: () => void;
  autoAlign: (roverPosition: { lat: number; lon: number }) => void;
  reset: () => void;
};

// ============================================================
// CAD bounding box for auto-alignment
// ============================================================

type BBox = { minX: number; minY: number; maxX: number; maxY: number };

function computeBBox(entities: Entity[]): BBox {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const e of entities) {
    switch (e.type) {
      case 'Line':
        minX = Math.min(minX, e.start.x, e.end.x);
        minY = Math.min(minY, e.start.y, e.end.y);
        maxX = Math.max(maxX, e.start.x, e.end.x);
        maxY = Math.max(maxY, e.start.y, e.end.y);
        break;
      case 'Point':
        minX = Math.min(minX, e.position.x);
        minY = Math.min(minY, e.position.y);
        maxX = Math.max(maxX, e.position.x);
        maxY = Math.max(maxY, e.position.y);
        break;
      case 'Polyline':
        minX = Math.min(minX, e.startPoint.x);
        minY = Math.min(minY, e.startPoint.y);
        maxX = Math.max(maxX, e.startPoint.x);
        maxY = Math.max(maxY, e.startPoint.y);
        for (const seg of e.segments) {
          minX = Math.min(minX, seg.to.x);
          minY = Math.min(minY, seg.to.y);
          maxX = Math.max(maxX, seg.to.x);
          maxY = Math.max(maxY, seg.to.y);
          if (seg.segmentType === 'Arc') {
            minX = Math.min(minX, seg.center.x - seg.radius);
            minY = Math.min(minY, seg.center.y - seg.radius);
            maxX = Math.max(maxX, seg.center.x + seg.radius);
            maxY = Math.max(maxY, seg.center.y + seg.radius);
          }
        }
        break;
      case 'Arc':
        minX = Math.min(minX, e.center.x - e.radius);
        minY = Math.min(minY, e.center.y - e.radius);
        maxX = Math.max(maxX, e.center.x + e.radius);
        maxY = Math.max(maxY, e.center.y + e.radius);
        break;
    }
  }

  return {
    minX: isFinite(minX) ? minX : 0,
    minY: isFinite(minY) ? minY : 0,
    maxX: isFinite(maxX) ? maxX : 100,
    maxY: isFinite(maxY) ? maxY : 100,
  };
}

/**
 * Hook that manages the CAD georeferencing alignment workflow.
 *
 * @param waypointConfig - Configuration for GeoEntity → Waypoint conversion
 * @returns State machine + actions for the alignment flow
 */
export function useCADAlignment(
  waypointConfig: GeoToWaypointConfig = {}
): UseCADAlignmentReturn {
  const [state, setState] = useState<CADAlignmentState>('idle');
  const [cadModel, setCadModel] = useState<CADModel | null>(null);
  const [cadPointA, setCadPointA] = useState<Point2D | null>(null);
  const [cadPointB, setCadPointB] = useState<Point2D | null>(null);
  const [geoPointA, setGeoPointA] = useState<GeoPoint | null>(null);
  const [geoPointB, setGeoPointB] = useState<GeoPoint | null>(null);
  const [computedWaypoints, setComputedWaypoints] = useState<PathPlanWaypoint[] | null>(null);
  const [georefResult, setGeorefResult] = useState<GeorefResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** Step 1: Parse DXF content → CADModel */
  const loadDXF = useCallback((content: string) => {
    try {
      setErrorMessage(null);
      const model = parseDXF(content);

      if (model.entities.length === 0) {
        setErrorMessage('No supported entities found in DXF file.');
        setState('error');
        return;
      }

      setCadModel(model);
      setCadPointA(null);
      setCadPointB(null);
      setGeoPointA(null);
      setGeoPointB(null);
      setComputedWaypoints(null);
      setGeorefResult(null);
      setState('cad_loaded');
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Failed to parse DXF file.');
      setState('error');
    }
  }, []);

  /** Step 2: User selects 2 CAD reference points on the canvas */
  const setCADPoints = useCallback((a: Point2D, b: Point2D) => {
    setCadPointA(a);
    setCadPointB(b);
    setState('points_selected');
  }, []);

  /** Step 3: User enters 2 GPS reference coordinates */
  const setGPSPoints = useCallback((a: GeoPoint, b: GeoPoint) => {
    setGeoPointA(a);
    setGeoPointB(b);
    setState('gps_entered');
  }, []);

  /** Step 4: Run georeferencing pipeline */
  const computeAlignment = useCallback(() => {
    if (!cadModel || !cadPointA || !cadPointB || !geoPointA || !geoPointB) {
      setErrorMessage('Missing reference points. Select CAD and GPS points first.');
      setState('error');
      return;
    }

    try {
      setErrorMessage(null);

      // Run the full pipeline
      const result = georeferenceCAD(cadModel, cadPointA, cadPointB, geoPointA, geoPointB);

      // Convert to waypoints
      const waypoints = geoEntitiesToWaypoints(result.geoEntities, waypointConfig);

      setGeorefResult(result);
      setComputedWaypoints(waypoints);
      setState('computed');
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Georeferencing computation failed.');
      setState('error');
    }
  }, [cadModel, cadPointA, cadPointB, geoPointA, geoPointB, waypointConfig]);

  /**
   * Auto-align: Place the CAD drawing at the rover position, oriented North.
   *
   * Uses two synthetic reference points:
   *   - CAD bottom-left of bounding box → rover GPS position
   *   - CAD top-left of bounding box → rover GPS position + height North
   *
   * This assumes CAD Y-axis = North, CAD X-axis = East (standard CAD convention).
   * If the rover is at (0,0), the waypoints end up near Null Island — fine for testing.
   */
  const autoAlign = useCallback((roverPosition: { lat: number; lon: number }) => {
    if (!cadModel) {
      setErrorMessage('No CAD model loaded. Load a DXF file first.');
      setState('error');
      return;
    }

    try {
      setErrorMessage(null);

      // Compute bounding box of all entities
      const bbox = computeBBox(cadModel.entities);

      // CAD reference points: bottom-left and top-left of bounding box
      const cadA: Point2D = { x: bbox.minX, y: bbox.minY };
      const cadB: Point2D = { x: bbox.minX, y: bbox.maxY };

      // GPS reference points: rover position for A, directly North for B
      const geoA: GeoPoint = { lat: roverPosition.lat, lon: roverPosition.lon };

      // Distance in meters from bbox bottom to top (Y-axis = North)
      const heightMeters = bbox.maxY - bbox.minY;

      // Point B is directly North of rover by the drawing height in meters
      const cosLat = Math.cos(roverPosition.lat * Math.PI / 180);
      const safeCosLat = Math.max(Math.abs(cosLat), 1e-10);
      const geoB: GeoPoint = {
        lat: roverPosition.lat + (heightMeters / EARTH_RADIUS) * (180 / Math.PI),
        lon: roverPosition.lon,
      };

      // Set reference points and compute
      setCadPointA(cadA);
      setCadPointB(cadB);
      setGeoPointA(geoA);
      setGeoPointB(geoB);

      // Run the full pipeline
      const result = georeferenceCAD(cadModel, cadA, cadB, geoA, geoB);

      // Convert to waypoints
      const waypoints = geoEntitiesToWaypoints(result.geoEntities, waypointConfig);

      setGeorefResult(result);
      setComputedWaypoints(waypoints);
      setState('computed');
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Auto-alignment failed.');
      setState('error');
    }
  }, [cadModel, waypointConfig]);

  /** Reset to idle state */
  const reset = useCallback(() => {
    setCadModel(null);
    setCadPointA(null);
    setCadPointB(null);
    setGeoPointA(null);
    setGeoPointB(null);
    setComputedWaypoints(null);
    setGeorefResult(null);
    setErrorMessage(null);
    setState('idle');
  }, []);

  return {
    state,
    cadModel,
    cadPointA,
    cadPointB,
    geoPointA,
    geoPointB,
    computedWaypoints,
    georefResult,
    errorMessage,
    loadDXF,
    setCADPoints,
    setGPSPoints,
    computeAlignment,
    autoAlign,
    reset,
  };
}
