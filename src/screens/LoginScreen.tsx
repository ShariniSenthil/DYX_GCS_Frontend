/**
 * Login screen for the DYX 4WD Rover Backend.
 *
 * Behaviour:
 * - Uses POST /api/auth/login.
 * - Stores the returned X-Rover-Token through AuthContext.
 * - The login remains stored until the operator explicitly logs out.
 * - Wi-Fi loss or Jetson restart does not clear the login.
 */

import React, { useCallback, useRef, useState } from "react";

import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../hooks/useAuth";

import { getBackendURL } from "../config";

interface LoginScreenProps {
  /**
   * Retained for compatibility when the login screen is used as a
   * re-authentication overlay.
   */
  isReAuth?: boolean;

  /**
   * Optional escape hatch back to the RoverDiscoveryScreen.
   *
   * Only rendered when provided AND the screen is not a re-auth overlay,
   * so a forced re-authentication can never be bypassed.
   */
  onBack?: () => void;
}

export default function LoginScreen({
  isReAuth = false,
  onBack,
}: LoginScreenProps): React.ReactElement {
  const { login, lastError } = useAuth();

  const [username, setUsername] = useState("admin");

  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [localError, setLocalError] = useState<string | null>(null);

  const passwordInputRef = useRef<TextInput>(null);

  const shakeAnimation = useRef(new Animated.Value(0)).current;

  const backendURL = getBackendURL();

  // ── Error animation ──────────────────────────────────────────────────────

  const shake = useCallback((): void => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 8,
        duration: 60,
        useNativeDriver: true,
      }),

      Animated.timing(shakeAnimation, {
        toValue: -8,
        duration: 60,
        useNativeDriver: true,
      }),

      Animated.timing(shakeAnimation, {
        toValue: 6,
        duration: 60,
        useNativeDriver: true,
      }),

      Animated.timing(shakeAnimation, {
        toValue: -6,
        duration: 60,
        useNativeDriver: true,
      }),

      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnimation]);

  // ── Login ────────────────────────────────────────────────────────────────

  const handleLogin = useCallback(async (): Promise<void> => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setLocalError("Username is required.");

      shake();
      return;
    }

    if (!password) {
      setLocalError("Password is required.");

      shake();
      passwordInputRef.current?.focus();
      return;
    }

    setLocalError(null);
    setIsSubmitting(true);

    try {
      await login(trimmedUsername, password);

      /*
       * AuthContext saves the session and changes isAuthenticated to true.
       * AuthGate then automatically opens the main application.
       */
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed.";

      const normalizedMessage = message.toLowerCase();

      const invalidCredentials =
        normalizedMessage.includes("401") ||
        normalizedMessage.includes("invalid") ||
        normalizedMessage.includes("unauthorized");

      setLocalError(
        invalidCredentials
          ? "Incorrect username or password."
          : `Could not connect to the rover: ${message}`,
      );

      shake();
    } finally {
      setIsSubmitting(false);
    }
  }, [username, password, login, shake]);

  const errorMessage = localError ?? lastError?.message ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Back to rover discovery — hidden for re-auth and when no handler */}
      {onBack && !isReAuth && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.7}
          disabled={isSubmitting}
        >
          <Ionicons name="chevron-back" size={15} color="#94A3B8" />
          <Text style={styles.backButtonText}>Back to Rovers</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}

        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="shield-checkmark" size={36} color="#4ADE80" />
          </View>

          <Text style={styles.title}>
            {isReAuth ? "Operator Login" : "DYX Rover Login"}
          </Text>

          <Text style={styles.subtitle}>
            Sign in to access the DYX 4WD Rover Ground Control Station.
          </Text>
        </View>

        {/* Selected backend */}

        <View style={styles.serverInfo}>
          <Ionicons name="server-outline" size={14} color="#64748B" />

          <Text style={styles.serverText} numberOfLines={1}>
            {backendURL}
          </Text>
        </View>

        {/* Login form */}

        <Animated.View
          style={[
            styles.form,
            {
              transform: [
                {
                  translateX: shakeAnimation,
                },
              ],
            },
          ]}
        >
          <Text style={styles.label}>Username</Text>

          <View
            style={[
              styles.inputRow,
              errorMessage ? styles.inputRowError : null,
            ]}
          >
            <Ionicons
              name="person-outline"
              size={19}
              color="#64748B"
              style={styles.inputIcon}
            />

            <TextInput
              style={styles.input}
              placeholder="Enter username"
              placeholderTextColor="#475569"
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                setLocalError(null);
              }}
              onSubmitEditing={() => {
                passwordInputRef.current?.focus();
              }}
              returnKeyType="next"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
            />
          </View>

          <Text style={[styles.label, styles.passwordLabel]}>Password</Text>

          <View
            style={[
              styles.inputRow,
              errorMessage ? styles.inputRowError : null,
            ]}
          >
            <Ionicons
              name="lock-closed-outline"
              size={19}
              color="#64748B"
              style={styles.inputIcon}
            />

            <TextInput
              ref={passwordInputRef}
              style={styles.input}
              placeholder="Enter password"
              placeholderTextColor="#475569"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setLocalError(null);
              }}
              onSubmitEditing={() => {
                void handleLogin();
              }}
              returnKeyType="done"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
            />

            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => {
                setShowPassword((currentValue) => !currentValue);
              }}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel={
                showPassword ? "Hide password" : "Show password"
              }
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>
          </View>

          {errorMessage ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />

              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.loginButton,
              isSubmitting || !username.trim() || !password
                ? styles.loginButtonDisabled
                : null,
            ]}
            onPress={() => {
              void handleLogin();
            }}
            disabled={isSubmitting || !username.trim() || !password}
            accessibilityRole="button"
            accessibilityLabel="Login to rover"
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={19} color="#0F172A" />

                <Text style={styles.loginButtonText}>Login</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Persistent-login information */}

        <View style={styles.persistenceInfo}>
          <Ionicons
            name="information-circle-outline"
            size={15}
            color="#64748B"
          />

          <Text style={styles.persistenceText}>
            You will remain logged in until you explicitly select Logout.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A1628",
  },

  backButton: {
    position: "absolute",
    top: 48,
    left: 20,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#0F1C2E",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  backButtonText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 36,
  },

  header: {
    alignItems: "center",
    marginBottom: 26,
  },

  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#0F2942",
    borderWidth: 2,
    borderColor: "#1E3A5F",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },

  title: {
    color: "#F1F5F9",
    fontSize: 23,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 8,
  },

  subtitle: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 380,
  },

  serverInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    maxWidth: 390,
    marginBottom: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#0F1C2E",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  serverText: {
    flexShrink: 1,
    color: "#64748B",
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  form: {
    width: "100%",
    maxWidth: 390,
  },

  label: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },

  passwordLabel: {
    marginTop: 16,
  },

  inputRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#0F1C2E",
  },

  inputRowError: {
    borderColor: "#EF4444",
  },

  inputIcon: {
    marginLeft: 13,
  },

  input: {
    flex: 1,
    minHeight: 48,
    color: "#F1F5F9",
    fontSize: 15,
    paddingHorizontal: 11,
  },

  eyeButton: {
    paddingHorizontal: 13,
    paddingVertical: 13,
  },

  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 10,
  },

  errorText: {
    flex: 1,
    color: "#EF4444",
    fontSize: 12,
    lineHeight: 17,
  },

  loginButton: {
    height: 50,
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    backgroundColor: "#4ADE80",
  },

  loginButtonDisabled: {
    opacity: 0.45,
  },

  loginButtonText: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "700",
  },

  persistenceInfo: {
    maxWidth: 390,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 25,
    paddingHorizontal: 12,
  },

  persistenceText: {
    flex: 1,
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
});
