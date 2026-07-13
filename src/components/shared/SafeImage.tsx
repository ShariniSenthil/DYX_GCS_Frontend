/**
 * SafeImage Component
 * 
 * Crash-resistant image loader that handles all failure scenarios:
 * - Network timeouts
 * - Invalid URLs
 * - Memory issues
 * - Loading failures
 * 
 * Usage:
 * <SafeImage source={{ uri: 'https://...' }} style={styles.image} />
 */

import React, { useState } from 'react';
import { Image, ImageProps, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import GlobalCrashHandler from '../../services/GlobalCrashHandler';

interface SafeImageProps extends ImageProps {
  fallbackIcon?: string;
  showLoadingIndicator?: boolean;
  onErrorCustom?: (error: any) => void;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  source,
  style,
  fallbackIcon = '🖼️',
  showLoadingIndicator = true,
  onErrorCustom,
  ...props
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleLoadStart = () => {
    setLoading(true);
    setError(false);
  };

  const handleLoadEnd = () => {
    setLoading(false);
  };

  const handleError = (errorEvent: any) => {
    setLoading(false);
    setError(true);

    // Log to crash handler
    GlobalCrashHandler.safeSync(
      () => {
        const uri = typeof source === 'object' && 'uri' in source ? source.uri : 'unknown';
        console.error('[SafeImage] Failed to load image:', uri, errorEvent);
      },
      undefined,
      'SafeImage.handleError'
    );

    // Call custom error handler if provided
    if (onErrorCustom) {
      GlobalCrashHandler.safeSync(
        () => onErrorCustom(errorEvent),
        undefined,
        'SafeImage.onErrorCustom'
      );
    }
  };

  if (error) {
    return (
      <View style={[styles.fallbackContainer, style]}>
        <Text style={styles.fallbackIcon}>{fallbackIcon}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Image
        {...props}
        source={source}
        style={style}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
      />
      {loading && showLoadingIndicator && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#ffffff" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  fallbackIcon: {
    fontSize: 32,
  },
});

export default SafeImage;
