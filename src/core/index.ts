// Core geometry types
export * from './geometry/types';

// ENU coordinate conversion
export * from './geo/enu';

// DXF parser
export { parseDXF, createMockCADModel } from './parser/dxfParser';

// Transform engine
export { computeTransform, applyTransform, transformPoint } from './transform/transformEngine';
export type { TransformMatrix } from './transform/transformEngine';

// Georeferencing service
export { georeferenceCAD } from './georef/georeferenceService';

// ── DXF Localization Pipeline ────────────────────────────────

// ParsedPoint data model
export type {
  EntityType,
  LwPolylineSource,
  LineSource,
  CircleSource,
  ArcSource,
  SourceEntity,
  ParsedPoint,
  ParsedPointSet,
  ControlPointInput,
  SimilarityParams,
  ResidualEntry,
  SolveResult,
  SolveFailure,
  SolveOutcome,
} from './geometry/parsedPoint';

// DXF → ParsedPointSet adapter
export { toParsedPointSet, parseDxfToPointSet } from './parser/toParsedPointSet';

// Similarity solver
export { solveSimilarityLS } from './transform/solveSimilarityLS';

// Transform application
export { applyTransformToPointSet } from './transform/applyTransformToPointSet';

// Residual computation and formatting
export { computeResiduals } from './transform/computeResiduals';
export { formatResidualMeters } from './transform/formatResidualMeters';

// Orchestrator
export { localizeDxfPointSet } from './georef/localizeDxfPointSet';
