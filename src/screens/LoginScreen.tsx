/**
 * LoginScreen — Operator password entry for 4WD_SERVER authentication.
 *
 * Displayed before the tab navigator whenever `isAuthenticated` is false.
 * Dismissed automatically when login succeeds (AuthContext updates).
 *
 * Design:
 * - Full-screen dark overlay matching the GCS theme
 * - Single password field (backend is password-only, no username)
 * - Shows backend URL so operator knows which rover they are connecting to
 * - Expiry warning banner re-prompts before token expires mid-mission
 */

import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../hooks/useAuth";
import { getBackendURL } from "../config";

interface LoginScreenProps {
  /** If true, shown as re-auth overlay (expiry) instead of initial gate. */
  isReAuth?: boolean;
}

export default function LoginScreen({
  isReAuth = false,
}: LoginScreenProps): React.ReactElement {
  const { login, lastError, isLoading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const backendUrl = getBackendURL();

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 6,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -6,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  const handleLogin = useCallback(async () => {
    if (!password.trim()) {
      setLocalError("Password is required.");
      shake();
      return;
    }

    setLocalError(null);
    setIsSubmitting(true);

    try {
      await login("admin", password);
      // AuthContext updates isAuthenticated → parent re-renders to main UI
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const displayMsg =
        msg.includes("401") ||
        msg.includes("invalid_password") ||
        msg.includes("nvalid")
          ? "Incorrect password. Please try again."
          : `Connection failed: ${msg}`;
      setLocalError(displayMsg);
      shake();
    } finally {
      setIsSubmitting(false);
    }
  }, [password, login, shake]);

  const errorMessage = localError ?? lastError?.message ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="shield-checkmark" size={36} color="#4ADE80" />
          </View>
          <Text style={styles.title}>
            {isReAuth ? "Session Expired" : "GCS Authentication"}
          </Text>
          <Text style={styles.subtitle}>
            {isReAuth
              ? "Your session has expired. Re-enter your password to continue."
              : "Enter operator password to access the Ground Control Station."}
          </Text>
        </View>

        {/* Backend info */}
        <View style={styles.serverInfo}>
          <Ionicons name="server-outline" size={13} color="#64748B" />
          <Text style={styles.serverText} numberOfLines={1}>
            {backendUrl}
          </Text>
        </View>

        {/* Form */}
        <Animated.View
          style={[styles.form, { transform: [{ translateX: shakeAnim }] }]}
        >
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, errorMessage ? styles.inputError : null]}
              placeholder="Enter operator password"
              placeholderTextColor="#475569"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setLocalError(null);
              }}
              onSubmitEditing={handleLogin}
              returnKeyType="done"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
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
              <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.loginBtn, isSubmitting && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting || !password.trim()}
            accessibilityLabel="Login"
            accessibilityRole="button"
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={18} color="#0F172A" />
                <Text style={styles.loginBtnText}>
                  {isReAuth ? "Re-authenticate" : "Login"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Hint */}
        <Text style={styles.hint}>
          Contact your system administrator if you have forgotten your password.
          Operator accounts are managed via rover_auth_cli on the Jetson.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A1628",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#0F2942",
    borderWidth: 2,
    borderColor: "#1E3A5F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F1F5F9",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 320,
  },
  serverInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0F1C2E",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 28,
    maxWidth: 340,
  },
  serverText: {
    fontSize: 11,
    color: "#64748B",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flexShrink: 1,
  },
  form: {
    width: "100%",
    maxWidth: 360,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F1C2E",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 8,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#F1F5F9",
  },
  inputError: {
    borderColor: "#EF4444",
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    flex: 1,
  },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4ADE80",
    borderRadius: 8,
    height: 48,
    marginTop: 8,
  },
  loginBtnDisabled: {
    opacity: 0.5,
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  hint: {
    fontSize: 11,
    color: "#334155",
    textAlign: "center",
    lineHeight: 16,
    maxWidth: 320,
    marginTop: 32,
  },
});
