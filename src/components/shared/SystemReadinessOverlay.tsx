/**
 * System Readiness Overlay
 * 
 * Full-screen loading overlay showing initialization status of all system components
 * Inspired by game loading screens (Free Fire, PUBG) with real-time status updates
 * 
 * Features:
 * - Shows each component's initialization status with icons and progress
 * - Prevents user interaction until all critical systems are ready
 * - Smooth animations and transitions
 * - Error handling and reconnection states
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
  StatusBar
} from 'react-native';
import { useComponentReadiness, ComponentInfo, SystemCategory } from '../../context/ComponentReadinessContext';
import { colors } from '../../theme/colors';

const { width, height } = Dimensions.get('window');

interface SystemReadinessOverlayProps {
  /** Logo or app title */
  appName?: string;
  /** Show detailed component list */
  showDetails?: boolean;
}

export function SystemReadinessOverlay({ 
  appName = 'DYX-GCS',
  showDetails = true 
}: SystemReadinessOverlayProps) {
  const {
    components,
    overallProgress,
    isAppReady,
    readinessMessage,
    getCategoryComponents
  } = useComponentReadiness();

  const fadeAnim = React.useRef(new Animated.Value(1)).current;
  const [shouldRender, setShouldRender] = React.useState(true);

  // Fade out animation when ready
  React.useEffect(() => {
    if (isAppReady) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setShouldRender(false);
      });
    } else {
      // Fade in if not ready
      setShouldRender(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isAppReady, fadeAnim]);

  if (!shouldRender) {
    return null;
  }

  const categories: SystemCategory[] = ['network', 'telemetry', 'navigation', 'mission', 'map', 'ui'];
  
  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      <View style={styles.container}>
        {/* App Title */}
        <View style={styles.header}>
          <Text style={styles.appTitle}>{appName}</Text>
          <Text style={styles.subtitle}>Ground Control Station</Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBarFill, { width: `${overallProgress}%` }]} />
          </View>
          <Text style={styles.progressText}>{overallProgress}%</Text>
        </View>

        {/* Status Message */}
        <Text style={styles.statusMessage}>{readinessMessage}</Text>

        {/* Component Status List */}
        {showDetails && (
          <View style={styles.detailsSection}>
            {categories.map(category => {
              const categoryComponents = getCategoryComponents(category);
              if (categoryComponents.length === 0) return null;

              return (
                <View key={category} style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>
                    {getCategoryIcon(category)} {getCategoryLabel(category)}
                  </Text>
                  {categoryComponents.map((component: ComponentInfo) => (
                    <ComponentStatusRow key={component.id} component={component} />
                  ))}
                </View>
              );
            })}
          </View>
        )}

        {/* Loading Spinner */}
        <View style={styles.spinnerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>

        {/* Footer */}
        <Text style={styles.footer}>Please wait while we initialize all systems...</Text>
      </View>
    </Animated.View>
  );
}

interface ComponentStatusRowProps {
  component: ComponentInfo;
}

function ComponentStatusRow({ component }: ComponentStatusRowProps) {
  const { status, name, progress, message, error } = component;

  const getStatusIcon = () => {
    switch (status) {
      case 'ready': return '✅';
      case 'error': return '❌';
      case 'reconnecting': return '🔄';
      default: return '⏳';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'ready': return colors.success;
      case 'error': return colors.danger;
      case 'reconnecting': return colors.warning;
      default: return colors.textSecondary;
    }
  };

  return (
    <View style={styles.componentRow}>
      <Text style={styles.statusIcon}>{getStatusIcon()}</Text>
      <View style={styles.componentInfo}>
        <Text style={[styles.componentName, { color: getStatusColor() }]}>
          {name}
        </Text>
        {message && (
          <Text style={styles.componentMessage}>{message}</Text>
        )}
        {error && (
          <Text style={styles.componentError}>{error}</Text>
        )}
      </View>
      {progress !== undefined && progress < 100 && status !== 'ready' && (
        <Text style={styles.componentProgress}>{progress}%</Text>
      )}
    </View>
  );
}

function getCategoryIcon(category: SystemCategory): string {
  switch (category) {
    case 'network': return '🌐';
    case 'telemetry': return '📡';
    case 'navigation': return '🧭';
    case 'mission': return '🎯';
    case 'map': return '🗺️';
    case 'ui': return '🎨';
    default: return '⚙️';
  }
}

function getCategoryLabel(category: SystemCategory): string {
  switch (category) {
    case 'network': return 'Network';
    case 'telemetry': return 'Telemetry';
    case 'navigation': return 'Navigation';
    case 'mission': return 'Mission System';
    case 'map': return 'Map Rendering';
    case 'ui': return 'User Interface';
    default: return category;
  }
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    zIndex: 9999,
    elevation: 9999,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  appTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 8,
    textShadowColor: colors.secondary,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  progressSection: {
    width: '80%',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: colors.cardBg,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  statusMessage: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 30,
    textAlign: 'center',
  },
  detailsSection: {
    width: '90%',
    maxHeight: height * 0.4,
    marginBottom: 20,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  componentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.cardBg,
    borderRadius: 6,
    marginBottom: 4,
  },
  statusIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  componentInfo: {
    flex: 1,
  },
  componentName: {
    fontSize: 14,
    fontWeight: '500',
  },
  componentMessage: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  componentError: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 2,
  },
  componentProgress: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  spinnerContainer: {
    marginVertical: 20,
  },
  footer: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 20,
  },
});
