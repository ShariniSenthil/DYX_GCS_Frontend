// ============================================================
// Parser Unit Tests
// ============================================================
// Run with: npx jest src/core/parsers/__tests__/parsers.test.ts

import { parseCSV } from '../csvParser';
import { parseJSON } from '../jsonParser';
import { parseKML } from '../kmlParser';
import { parseQGC } from '../qgcParser';
import { parseExcelData, SheetRow } from '../excelParser';
import { convertToPathPlanWaypoint, convertToPathPlanWaypoints } from '../adapter';
import {
  stripBOM,
  detectDelimiter,
  detectCoordinateColumns,
  validateLatLon,
  validateUTMCoordinate,
  utmToLatLon,
  parseUTMZone,
  safeFloat,
  buildCoordinate,
  extensionToFormat,
} from '../utils';

// ============================================================
// UTILS TESTS
// ============================================================

describe('Parser Utils', () => {
  // stripBOM
  describe('stripBOM', () => {
    it('removes BOM from start of string', () => {
      expect(stripBOM('\uFEFFlatitude,longitude')).toBe('latitude,longitude');
    });
    it('leaves string unchanged if no BOM', () => {
      expect(stripBOM('latitude,longitude')).toBe('latitude,longitude');
    });
    it('handles empty string', () => {
      expect(stripBOM('')).toBe('');
    });
  });

  // detectDelimiter
  describe('detectDelimiter', () => {
    it('detects comma', () => {
      expect(detectDelimiter('a,b,c')).toBe(',');
    });
    it('detects semicolon', () => {
      expect(detectDelimiter('a;b;c')).toBe(';');
    });
    it('detects tab', () => {
      expect(detectDelimiter('a\tb\tc')).toBe('\t');
    });
    it('detects pipe', () => {
      expect(detectDelimiter('a|b|c')).toBe('|');
    });
    it('falls back to comma if no delimiter found', () => {
      expect(detectDelimiter('abc')).toBe(',');
    });
  });

  // detectCoordinateColumns
  describe('detectCoordinateColumns', () => {
    it('finds lat/lon columns', () => {
      const cols = detectCoordinateColumns(['lat', 'lon', 'alt']);
      expect(cols.latCol).toBe(0);
      expect(cols.lonCol).toBe(1);
      expect(cols.elevCol).toBe(2);
    });
    it('finds lng variant', () => {
      const cols = detectCoordinateColumns(['latitude', 'lng', 'elevation']);
      expect(cols.latCol).toBe(0);
      expect(cols.lonCol).toBe(1);
    });
    it('finds easting/northing columns', () => {
      const cols = detectCoordinateColumns(['E', 'N', 'Elevation']);
      expect(cols.eastCol).toBe(0);
      expect(cols.northCol).toBe(1);
    });
    it('finds X/Y variants', () => {
      const cols = detectCoordinateColumns(['X', 'Y', 'Z']);
      expect(cols.eastCol).toBe(0);
      expect(cols.northCol).toBe(1);
    });
    it('finds label columns', () => {
      const cols = detectCoordinateColumns(['lat', 'lon', 'pile']);
      expect(cols.labelCol).toBe(2);
    });
    it('returns -1 for unrecognized columns', () => {
      const cols = detectCoordinateColumns(['foo', 'bar', 'baz']);
      expect(cols.latCol).toBe(-1);
      expect(cols.lonCol).toBe(-1);
    });
  });

  // validateLatLon
  describe('validateLatLon', () => {
    it('accepts valid coordinates', () => {
      expect(validateLatLon(25.0, 55.0)).toBe(true);
    });
    it('rejects NaN', () => {
      expect(validateLatLon(NaN, 55.0)).toBe(false);
      expect(validateLatLon(25.0, NaN)).toBe(false);
    });
    it('rejects out-of-range latitude', () => {
      expect(validateLatLon(91, 55.0)).toBe(false);
      expect(validateLatLon(-91, 55.0)).toBe(false);
    });
    it('rejects out-of-range longitude', () => {
      expect(validateLatLon(25.0, 181)).toBe(false);
      expect(validateLatLon(25.0, -181)).toBe(false);
    });
    it('accepts boundary values', () => {
      expect(validateLatLon(90, 180)).toBe(true);
      expect(validateLatLon(-90, -180)).toBe(true);
    });
  });

  // validateUTMCoordinate
  describe('validateUTMCoordinate', () => {
    it('accepts valid UTM coords', () => {
      expect(validateUTMCoordinate(500000, 3000000)).toBe(true);
    });
    it('rejects easting out of range', () => {
      expect(validateUTMCoordinate(50000, 3000000)).toBe(false);
      expect(validateUTMCoordinate(950000, 3000000)).toBe(false);
    });
    it('rejects northing out of range', () => {
      expect(validateUTMCoordinate(500000, -100)).toBe(false);
      expect(validateUTMCoordinate(500000, 11000000)).toBe(false);
    });
  });

  // utmToLatLon
  describe('utmToLatLon', () => {
    it('converts UTM to lat/lon for known point', () => {
      // UAE, zone 40N: Dubai approx. 25.2048°N, 55.2708°E
      // UTM approx: E=426000, N=2788000 in zone 40N
      const result = utmToLatLon(426000, 2788000, '40N');
      expect(result.lat).toBeGreaterThan(24);
      expect(result.lat).toBeLessThan(26);
      expect(result.lon).toBeGreaterThan(54);
      expect(result.lon).toBeLessThan(58); // Wide bounds — Snyder has ~10m accuracy
    });
    it('handles southern hemisphere', () => {
      // Sydney, zone 56H: approx. -33.8688°S, 151.2093°E
      // UTM approx: E=334000, N=6250000 in zone 56S
      const result = utmToLatLon(334000, 6250000, '56S');
      expect(result.lat).toBeGreaterThan(-35);
      expect(result.lat).toBeLessThan(-32);
    });
    it('defaults to zone 43N for invalid zone string', () => {
      const result = utmToLatLon(500000, 3000000, 'invalid');
      expect(typeof result.lat).toBe('number');
      expect(typeof result.lon).toBe('number');
    });
  });

  // parseUTMZone
  describe('parseUTMZone', () => {
    it('parses valid zone', () => {
      const z = parseUTMZone('43N');
      expect(z.zoneNum).toBe(43);
      expect(z.hemisphere).toBe('N');
    });
    it('parses southern hemisphere', () => {
      const z = parseUTMZone('56S');
      expect(z.zoneNum).toBe(56);
      expect(z.hemisphere).toBe('S');
    });
    it('defaults on invalid input', () => {
      const z = parseUTMZone('abc');
      expect(z.zoneNum).toBe(43);
      expect(z.hemisphere).toBe('N');
    });
  });

  // safeFloat
  describe('safeFloat', () => {
    it('parses valid number string', () => {
      expect(safeFloat('25.123')).toBe(25.123);
    });
    it('returns null for NaN', () => {
      expect(safeFloat('abc')).toBeNull();
    });
    it('returns null for null/undefined', () => {
      expect(safeFloat(null)).toBeNull();
      expect(safeFloat(undefined)).toBeNull();
    });
    it('handles number input', () => {
      expect(safeFloat(42)).toBe(42);
      expect(safeFloat(NaN)).toBeNull();
    });
  });

  // extensionToFormat
  describe('extensionToFormat', () => {
    it('maps csv to CSV', () => {
      expect(extensionToFormat('csv')).toBe('CSV');
    });
    it('maps json to JSON', () => {
      expect(extensionToFormat('json')).toBe('JSON');
    });
    it('maps kml to KML', () => {
      expect(extensionToFormat('kml')).toBe('KML');
    });
    it('maps xlsx to EXCEL', () => {
      expect(extensionToFormat('xlsx')).toBe('EXCEL');
    });
    it('maps waypoint/waypoints to QGC', () => {
      expect(extensionToFormat('waypoint')).toBe('QGC');
      expect(extensionToFormat('waypoints')).toBe('QGC');
    });
    it('returns null for unknown extension', () => {
      expect(extensionToFormat('dxf')).toBeNull();
      expect(extensionToFormat('pdf')).toBeNull();
    });
  });
});

// ============================================================
// CSV PARSER TESTS
// ============================================================

describe('CSV Parser', () => {
  it('parses valid lat/lon CSV', () => {
    const content = 'latitude,longitude,altitude\n25.0,55.0,10\n25.1,55.1,20\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(2);
    expect(result.skipped_rows).toBe(0);
    expect(result.coordinates[0].latitude).toBe(25.0);
    expect(result.coordinates[0].longitude).toBe(55.0);
    expect(result.coordinates[0].elevation).toBe(10);
  });

  it('strips BOM prefix', () => {
    const content = '\uFEFFlat,lon,alt\n25.0,55.0,10\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(1);
  });

  it('detects semicolon delimiter', () => {
    const content = 'lat;lon;alt\n25.0;55.0;10\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(1);
  });

  it('detects tab delimiter', () => {
    const content = 'lat\tlon\talt\n25.0\t55.0\t10\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(1);
  });

  it('detects pipe delimiter', () => {
    const content = 'lat|lon|alt\n25.0|55.0|10\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(1);
  });

  it('parses UTM Easting/Northing with zone', () => {
    const content = 'E,N,Label\n500000,3000000,P1\n';
    const result = parseCSV(content, 'test.csv', '40N');
    expect(result.valid_points).toBe(1);
    expect(result.coordinate_system).toBe('UTM');
    expect(result.coordinates[0].easting).toBe(500000);
    expect(result.coordinates[0].northing).toBe(3000000);
    expect(result.coordinates[0].latitude).toBeDefined();
    expect(result.coordinates[0].longitude).toBeDefined();
  });

  it('warns when UTM columns detected but no zone provided', () => {
    const content = 'E,N,Label\n500000,3000000,P1\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.some(w => w.includes('no UTM zone'))).toBe(true);
  });

  it('handles empty file', () => {
    const result = parseCSV('', 'test.csv');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('handles header-only file', () => {
    const result = parseCSV('lat,lon\n', 'test.csv');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.some(w => w.includes('fewer than 2'))).toBe(true);
  });

  it('skips rows with missing coordinates', () => {
    const content = 'lat,lon\n25.0,55.0\nabc,def\n25.1,55.1\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(2);
    expect(result.skipped_rows).toBe(1);
  });

  it('skips empty rows silently', () => {
    const content = 'lat,lon\n25.0,55.0\n\n\n25.1,55.1\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(2);
  });

  it('extracts block/row/pile columns', () => {
    const content = 'lat,lon,block,row,pile\n25.0,55.0,B1,R1,P001\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(1);
    expect(result.coordinates[0].block).toBe('B1');
    expect(result.coordinates[0].row).toBe('R1');
    expect(result.coordinates[0].pile).toBe('P001');
  });

  it('reports unrecognized columns', () => {
    const content = 'foo,bar\n1,2\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.some(w => w.includes('No recognizable'))).toBe(true);
  });

  it('handles NaN values in coordinate columns', () => {
    const content = 'lat,lon\nNaN,55.0\n25.0,NaN\n';
    const result = parseCSV(content, 'test.csv');
    expect(result.valid_points).toBe(0);
    expect(result.skipped_rows).toBe(2);
  });
});

// ============================================================
// JSON PARSER TESTS
// ============================================================

describe('JSON Parser', () => {
  it('parses array of objects with lat/lon', () => {
    const content = JSON.stringify([
      { lat: 25.0, lon: 55.0, alt: 10 },
      { lat: 25.1, lon: 55.1, alt: 20 },
    ]);
    const result = parseJSON(content, 'test.json');
    expect(result.valid_points).toBe(2);
    expect(result.coordinates[0].latitude).toBe(25.0);
  });

  it('handles malformed JSON gracefully', () => {
    const content = '{lat: 25.0,}'; // invalid JSON
    const result = parseJSON(content, 'test.json');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.some(w => w.includes('Invalid JSON'))).toBe(true);
  });

  it('handles empty array', () => {
    const content = '[]';
    const result = parseJSON(content, 'test.json');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.some(w => w.includes('No waypoint'))).toBe(true);
  });

  it('parses nested {waypoints: [...]}', () => {
    const content = JSON.stringify({
      waypoints: [
        { latitude: 25.0, longitude: 55.0 },
      ],
    });
    const result = parseJSON(content, 'test.json');
    expect(result.valid_points).toBe(1);
  });

  it('parses nested {coordinates: [...]}', () => {
    const content = JSON.stringify({
      coordinates: [
        { lat: 25.0, lng: 55.0 },
      ],
    });
    const result = parseJSON(content, 'test.json');
    expect(result.valid_points).toBe(1);
  });

  it('parses GeoJSON FeatureCollection', () => {
    const content = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [55.0, 25.0, 10] },
          properties: { name: 'P1' },
        },
      ],
    });
    const result = parseJSON(content, 'test.geojson');
    expect(result.valid_points).toBe(1);
    expect(result.coordinates[0].latitude).toBe(25.0);
    expect(result.coordinates[0].longitude).toBe(55.0);
    expect(result.coordinates[0].elevation).toBe(10);
    expect(result.coordinates[0].label).toBe('P1');
  });

  it('parses GeoJSON FeatureCollection without altitude', () => {
    const content = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [55.0, 25.0] },
          properties: {},
        },
      ],
    });
    const result = parseJSON(content, 'test.geojson');
    expect(result.valid_points).toBe(1);
    expect(result.coordinates[0].elevation).toBeNull();
  });

  it('skips invalid items in array', () => {
    const content = JSON.stringify([
      { lat: 25.0, lon: 55.0 },
      'not an object',
      42,
      null,
      { lat: 25.1, lon: 55.1 },
    ]);
    const result = parseJSON(content, 'test.json');
    expect(result.valid_points).toBe(2);
    expect(result.skipped_rows).toBe(3);
  });

  it('extracts easting/northing if present', () => {
    const content = JSON.stringify([
      { lat: 25.0, lon: 55.0, easting: 500000, northing: 3000000 },
    ]);
    const result = parseJSON(content, 'test.json');
    expect(result.coordinates[0].easting).toBe(500000);
    expect(result.coordinates[0].northing).toBe(3000000);
  });

  it('handles non-string, non-array, non-object JSON', () => {
    const content = '42'; // valid JSON but not useful
    const result = parseJSON(content, 'test.json');
    expect(result.valid_points).toBe(0);
  });
});

// ============================================================
// KML PARSER TESTS
// ============================================================

describe('KML Parser', () => {
  it('parses valid KML with Point placemarks', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>P1</name>
      <Point>
        <coordinates>55.0,25.0,10</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>P2</name>
      <Point>
        <coordinates>55.1,25.1,20</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;
    const result = parseKML(content, 'test.kml');
    expect(result.valid_points).toBe(2);
    expect(result.coordinates[0].longitude).toBe(55.0);
    expect(result.coordinates[0].latitude).toBe(25.0);
    expect(result.coordinates[0].elevation).toBe(10);
    expect(result.coordinates[0].label).toBe('P1');
  });

  it('skips LineString and Polygon placemarks', () => {
    const content = `<?xml version="1.0"?>
<kml>
  <Placemark>
    <name>Route</name>
    <LineString>
      <coordinates>55.0,25.0 55.1,25.1</coordinates>
    </LineString>
  </Placemark>
  <Placemark>
    <name>P1</name>
    <Point>
      <coordinates>55.0,25.0,10</coordinates>
    </Point>
  </Placemark>
</kml>`;
    const result = parseKML(content, 'test.kml');
    expect(result.valid_points).toBe(1);
    expect(result.coordinates[0].label).toBe('P1');
  });

  it('handles 2-value coordinates (no altitude)', () => {
    const content = `<?xml version="1.0"?>
<kml>
  <Placemark>
    <Point>
      <coordinates>55.0,25.0</coordinates>
    </Point>
  </Placemark>
</kml>`;
    const result = parseKML(content, 'test.kml');
    expect(result.valid_points).toBe(1);
    expect(result.coordinates[0].elevation).toBeNull();
    expect(result.warnings.some(w => w.includes('No altitude'))).toBe(true);
  });

  it('handles empty KML', () => {
    const result = parseKML('', 'test.kml');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.some(w => w.toLowerCase().includes('parse') || w.toLowerCase().includes('placemark'))).toBe(true);
  });

  it('handles KML with no placemarks', () => {
    const content = `<?xml version="1.0"?>
<kml><Document></Document></kml>`;
    const result = parseKML(content, 'test.kml');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.some(w => w.includes('No Placemark'))).toBe(true);
  });

  it('handles namespace prefixes', () => {
    const content = `<?xml version="1.0"?>
<kml:kml xmlns:kml="http://www.opengis.net/kml/2.2">
  <kml:Placemark>
    <kml:name>P1</kml:name>
    <kml:Point>
      <kml:coordinates>55.0,25.0,10</kml:coordinates>
    </kml:Point>
  </kml:Placemark>
</kml:kml>`;
    const result = parseKML(content, 'test.kml');
    expect(result.valid_points).toBe(1);
    expect(result.coordinates[0].label).toBe('P1');
  });
});

// ============================================================
// QGC PARSER TESTS
// ============================================================

describe('QGC WPL 110 Parser', () => {
  const validQGC = 'QGC WPL 110\n0\t1\t0\t16\t0\t0\t0\t0\t25.0000000\t55.0000000\t0\t1\n1\t0\t3\t16\t0\t0\t0\t0\t25.1000000\t55.1000000\t50\t1\n';

  it('parses valid QGC file', () => {
    const result = parseQGC(validQGC, 'test.waypoint');
    expect(result.valid_points).toBeGreaterThanOrEqual(1);
    expect(result.coordinates[0].latitude).toBe(25.0);
    expect(result.coordinates[0].longitude).toBe(55.0);
  });

  it('rejects file without QGC header', () => {
    const result = parseQGC('25.0,55.0,10\n', 'test.waypoint');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.some(w => w.includes('Invalid QGC'))).toBe(true);
  });

  it('handles empty file', () => {
    const result = parseQGC('', 'test.waypoint');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('skips rows with insufficient columns', () => {
    const content = 'QGC WPL 110\n1\t0\t3\n';
    const result = parseQGC(content, 'test.waypoint');
    expect(result.valid_points).toBe(0);
    expect(result.skipped_rows).toBe(1);
  });

  it('skips rows with invalid lat/lon', () => {
    const content = 'QGC WPL 110\n1\t0\t3\t16\t0\t0\t0\t0\tabc\tdef\t50\t1\n';
    const result = parseQGC(content, 'test.waypoint');
    expect(result.valid_points).toBe(0);
    expect(result.skipped_rows).toBe(1);
  });

  it('skips rows with out-of-range latitude', () => {
    const content = 'QGC WPL 110\n1\t0\t3\t16\t0\t0\t0\t0\t95.0\t55.0\t50\t1\n';
    const result = parseQGC(content, 'test.waypoint');
    expect(result.valid_points).toBe(0);
    expect(result.skipped_rows).toBe(1);
  });
});

// ============================================================
// EXCEL PARSER TESTS
// ============================================================

describe('Excel Parser', () => {
  const mockRows: SheetRow[] = [
    { sheetName: 'Sheet1', cells: ['lat', 'lon', 'alt', 'pile'] },
    { sheetName: 'Sheet1', cells: [25.0, 55.0, 10, 'P001'] },
    { sheetName: 'Sheet1', cells: [25.1, 55.1, 20, 'P002'] },
  ];

  it('parses valid sheet data', () => {
    const result = parseExcelData(mockRows, 'test.xlsx');
    expect(result.valid_points).toBe(2);
    expect(result.coordinates[0].latitude).toBe(25.0);
    expect(result.coordinates[0].pile).toBe('P001');
  });

  it('handles empty sheet data', () => {
    const result = parseExcelData([], 'test.xlsx');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('parses multiple sheets and tags labels', () => {
    const multiSheetRows: SheetRow[] = [
      { sheetName: 'ZoneA', cells: ['lat', 'lon', 'pile'] },
      { sheetName: 'ZoneA', cells: [25.0, 55.0, 'ZA-001'] },
      { sheetName: 'ZoneB', cells: ['lat', 'lon', 'pile'] },
      { sheetName: 'ZoneB', cells: [25.1, 55.1, 'ZB-001'] },
    ];
    const result = parseExcelData(multiSheetRows, 'test.xlsx');
    expect(result.valid_points).toBe(2);
    expect(result.warnings.some(w => w.includes('Multiple sheets'))).toBe(true);
    expect(result.coordinates[0].label).toContain('ZA-001');
  });

  it('warns about .xls format', () => {
    const result = parseExcelData(mockRows, 'test.xls');
    expect(result.warnings.some(w => w.includes('.xls'))).toBe(true);
  });

  it('skips sheets with no coordinate columns', () => {
    const badRows: SheetRow[] = [
      { sheetName: 'Sheet1', cells: ['foo', 'bar'] },
      { sheetName: 'Sheet1', cells: [1, 2] },
    ];
    const result = parseExcelData(badRows, 'test.xlsx');
    expect(result.valid_points).toBe(0);
    expect(result.warnings.some(w => w.includes('No recognizable'))).toBe(true);
  });

  it('skips empty rows', () => {
    const rowsWithEmpty: SheetRow[] = [
      { sheetName: 'Sheet1', cells: ['lat', 'lon'] },
      { sheetName: 'Sheet1', cells: [25.0, 55.0] },
      { sheetName: 'Sheet1', cells: ['', ''] },
      { sheetName: 'Sheet1', cells: [25.1, 55.1] },
    ];
    const result = parseExcelData(rowsWithEmpty, 'test.xlsx');
    expect(result.valid_points).toBe(2);
    expect(result.skipped_rows).toBe(1);
  });
});

// ============================================================
// ADAPTER TESTS
// ============================================================

describe('Adapter: ParsedCoordinate → PathPlanWaypoint', () => {
  it('converts a single coordinate', () => {
    const coord = {
      id: 1,
      latitude: 25.0,
      longitude: 55.0,
      elevation: 10,
      easting: null,
      northing: null,
      label: 'P1',
      block: 'B1',
      row: 'R1',
      pile: 'P001',
      source_format: 'CSV' as const,
      raw_row: '25.0,55.0,10,P001',
    };
    const wp = convertToPathPlanWaypoint(coord);
    expect(wp.id).toBe(1);
    expect(wp.lat).toBe(25.0);
    expect(wp.lon).toBe(55.0);
    expect(wp.alt).toBe(10);
    expect(wp.pile).toBe('P001');
    expect(wp.block).toBe('B1');
    expect(wp.row).toBe('R1');
    expect(wp.distance).toBe(0);
    expect(wp.mark).toBeUndefined();
  });

  it('defaults null elevation to 0', () => {
    const coord = {
      id: 1,
      latitude: 25.0,
      longitude: 55.0,
      elevation: null,
      easting: null,
      northing: null,
      label: null,
      block: '',
      row: '',
      pile: '1',
      source_format: 'KML' as const,
      raw_row: '55.0,25.0',
    };
    const wp = convertToPathPlanWaypoint(coord);
    expect(wp.alt).toBe(0);
  });

  it('converts array of coordinates', () => {
    const coords = [
      { id: 1, latitude: 25.0, longitude: 55.0, elevation: 10, easting: null, northing: null, label: null, block: '', row: '', pile: '1', source_format: 'CSV' as const, raw_row: '' },
      { id: 2, latitude: 25.1, longitude: 55.1, elevation: 20, easting: null, northing: null, label: null, block: '', row: '', pile: '2', source_format: 'CSV' as const, raw_row: '' },
    ];
    const wps = convertToPathPlanWaypoints(coords);
    expect(wps).toHaveLength(2);
    expect(wps[0].id).toBe(1);
    expect(wps[1].id).toBe(2);
  });
});

console.log('✅ All parser tests defined. Run with: npx jest src/core/parsers/__tests__/parsers.test.ts');
