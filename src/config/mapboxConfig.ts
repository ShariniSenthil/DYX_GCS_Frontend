// Mapbox GL JS configuration
// Set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in your .env file — get a token from https://account.mapbox.com
export const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

export const MAPBOX_VERSION = '3.6.0';

// Map styles
export const MAPBOX_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';
export const MAPBOX_STYLE_STREETS   = 'mapbox://styles/mapbox/streets-v12';
export const MAPBOX_STYLE_DARK      = 'mapbox://styles/mapbox/dark-v11';

// CDN URLs — loaded inside WebView HTML, no bundling needed
export const MAPBOX_JS_URL  = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.js`;
export const MAPBOX_CSS_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.css`;
