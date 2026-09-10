// Public Mapbox token (pk.) is safe in the client. Prefer the env var so
// EAS/local .env can rotate it.
const BAKED_MAPBOX_PUBLIC_TOKEN = "";

export const MAPBOX_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || BAKED_MAPBOX_PUBLIC_TOKEN;

export const MAPBOX_VERSION = '2.15.0';

// Map styles
export const MAPBOX_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';
export const MAPBOX_STYLE_STREETS   = 'mapbox://styles/mapbox/streets-v12';
export const MAPBOX_STYLE_DARK      = 'mapbox://styles/mapbox/dark-v11';

// CDN URLs — loaded inside WebView HTML, no bundling needed
export const MAPBOX_JS_URL  = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.js`;
export const MAPBOX_CSS_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.css`;
