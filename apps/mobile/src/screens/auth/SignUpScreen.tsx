import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useAuthStore } from "../../store/authStore";
import { COLORS, SPACING } from "../../constants";

interface Props {
  onNavigateToSignIn: () => void;
}

export function SignUpScreen({ onNavigateToSignIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { register, loading, error, clearError } = useAuthStore();

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Required", "Please fill in all fields.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Too Short", "Password must be at least 8 characters.");
      return;
    }
    clearError();
    try {
      const result = await register(email.trim(), password);
      if (result.needsConfirmation) {
        Alert.alert(
          "Check Your Email",
          "We sent a confirmation link to your email. Please verify before signing in.",
          [{ text: "OK", onPress: onNavigateToSignIn }]
        );
      }
    } catch {
      // error is set in store
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>⚙️</Text>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Start designing parts by voice</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="engineer@example.com"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 8 characters"
            placeholderTextColor={COLORS.textMuted}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat password"
            placeholderTextColor={COLORS.textMuted}
            secureTextEntry
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onNavigateToSignIn} style={styles.link}>
            <Text style={styles.linkText}>
              Already have an account?{" "}
              <Text style={styles.linkAccent}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg0 },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },
  logo: { fontSize: 48, textAlign: "center", marginBottom: SPACING.sm },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.textPrimary,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.xl,
    marginTop: SPACING.xs,
  },
  form: { gap: SPACING.sm },
  label: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  input: {
    backgroundColor: COLORS.bg1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: SPACING.md,
    color: COLORS.textPrimary,
    fontSize: 16,
    marginBottom: SPACING.sm,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    padding: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: COLORS.textInverse,
    fontWeight: "700",
    fontSize: 16,
  },
  link: { marginTop: SPACING.md, alignItems: "center" },
  linkText: { color: COLORS.textSecondary, fontSize: 14 },
  linkAccent: { color: COLORS.accent, fontWeight: "600" },
});
