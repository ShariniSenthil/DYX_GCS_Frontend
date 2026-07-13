/**
 * ErrorBoundary Component
 * 
 * Catches React crashes and displays a graceful fallback UI instead of crashing the entire app.
 * Provides error details in development and allows users to recover gracefully.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';

interface Props {
  children: ReactNode;
  /** Optional fallback UI to display instead of default error screen */
  fallback?: ReactNode;
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Screen/component name for better error reporting */
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { componentName, onError } = this.props;
    
    // Log error details to console
    console.error(`[ErrorBoundary${componentName ? ` - ${componentName}` : ''}] Caught error:`, error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    // Update state with full error info
    this.setState({
      error,
      errorInfo,
    });

    // Call optional error callback
    if (onError) {
      onError(error, errorInfo);
    }

    // In production, you might want to send error to logging service
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, componentName } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default fallback UI
      return (
        <View style={styles.container}>
          <View style={styles.errorBox}>
            <Text style={styles.title}>⚠️ Something went wrong</Text>
            <Text style={styles.subtitle}>
              {componentName ? `Error in ${componentName}` : 'An unexpected error occurred'}
            </Text>
            
            {__DEV__ && error && (
              <ScrollView style={styles.detailsContainer}>
                <Text style={styles.detailsTitle}>Error Details (Development Mode):</Text>
                <Text style={styles.errorText}>{error.toString()}</Text>
                
                {errorInfo?.componentStack && (
                  <>
                    <Text style={styles.detailsTitle}>Component Stack:</Text>
                    <Text style={styles.stackText}>{errorInfo.componentStack}</Text>
                  </>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.resetButton} onPress={this.handleReset}>
              <Text style={styles.resetButtonText}>Try Again</Text>
            </TouchableOpacity>

            <Text style={styles.helpText}>
              If this problem persists, please restart the app.
            </Text>
          </View>
        </View>
      );
    }

    return children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorBox: {
    backgroundColor: colors.cardBg,
    borderRadius: 8,
    padding: 24,
    maxWidth: 500,
    width: '100%',
    borderWidth: 2,
    borderColor: colors.danger,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.danger,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  detailsContainer: {
    backgroundColor: colors.panelBg,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
    maxHeight: 200,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    fontFamily: 'monospace',
  },
  stackText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  resetButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  resetButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  helpText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default ErrorBoundary;
