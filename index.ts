import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import MapboxGL from '@rnmapbox/maps';

import App from './App';
import { MAPBOX_ACCESS_TOKEN } from './src/config/mapboxConfig';

if (MAPBOX_ACCESS_TOKEN) {
  MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);
}
MapboxGL.setTelemetryEnabled(false);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
