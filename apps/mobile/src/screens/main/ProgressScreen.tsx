/**
 * ProgressScreen — polls /api/mobile/job-status and shows live progress.
 * Navigates to ResultsScreen when job is complete.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConversationStore } from "../../store/conversationStore";
import { useAuthStore } from "../../store/authStore";
import { getJobStatus } from "../../services/api";
import { COLORS, SPACING } from "../../constants";
import type { JobStatusResponse } from "../../types";

const POLL_INTERVAL_MS = 3000;

interface Props {
  onNavigateToResults: (result: JobStatusResponse) => void;
  onNavigateHome: () => void;
}

export function ProgressScreen({ onNavigateToResults, onNavigateHome }: Props) {
  const { currentJobId } = useConversationStore();
  const { user } = useAuthStore();
  const [status, setStatus] = useState<string>("generating");
  const [error, setError] = useState<string | null>(null);
  const [dots, setDots] = useState(".");
  const spinAnim = React.useRef(new Animated.Value(0)).current;

  // Spinning gear animation
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    ).start();
  }, [spinAnim]);

  // Animated dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const poll = useCallback(async () => {
    if (!currentJobId || !user) return null;
    try {
      const result = await getJobStatus(currentJobId, user.accessToken);
      setStatus(result.job.status);
      return result;
    } catch (e: unknown) {
      setError((e as Error).message);
      return null;
    }
  }, [currentJobId, user]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const doPoll = async () => {
      const result = await poll();
      if (cancelled) return;

      if (result) {
        const s = result.job.status;
        if (s === "approved" || s === "awaiting_approval") {
          onNavigateToResults(result);
          return;
        }
        if (s === "failed") {
          setError(result.job.error_message || "Generation failed.");
          return;
        }
      }

      timer = setTimeout(doPoll, POLL_INTERVAL_MS);
    };

    doPoll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [poll, onNavigateToResults]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const statusLabels: Record<string, string> = {
    draft: "Preparing your part spec...",
    generating: "Generating CAD geometry...",
    awaiting_approval: "Finalizing artifacts...",
    approved: "Complete!",
    failed: "Generation failed",
  };

  const steps = [
    { key: "draft", label: "Spec prepared" },
    { key: "generating", label: "CAD geometry" },
    { key: "awaiting_approval", label: "Artifacts stored" },
    { key: "approved", label: "Ready to download" },
  ];

  const currentStepIdx = steps.findIndex((s) => s.key === status);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.inner}>
        {/* Animated gear */}
        <Animated.Text
          style={[styles.gearIcon, { transform: [{ rotate: spin }] }]}
        >
          ⚙️
        </Animated.Text>

        <Text style={styles.title}>
          {error ? "Generation Failed" : `Generating${dots}`}
        </Text>

        <Text style={styles.statusLabel}>
          {error || statusLabels[status] || "Processing..."}
        </Text>

        {/* Progress steps */}
        <View style={styles.steps}>
          {steps.map((step, idx) => {
            const done = idx < currentStepIdx;
            const active = idx === currentStepIdx;
            return (
              <View key={step.key} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepDot,
                    done && styles.stepDotDone,
                    active && styles.stepDotActive,
                  ]}
                >
                  {done && <Text style={styles.checkMark}>✓</Text>}
                  {active && !error && (
                    <ActivityIndicator size="small" color={COLORS.accent} />
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    done && styles.stepLabelDone,
                    active && styles.stepLabelActive,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>

        {error && (
          <TouchableOpacity style={styles.retryBtn} onPress={onNavigateHome}>
            <Text style={styles.retryText}>← Back to Design</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg0 },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  gearIcon: { fontSize: 64, marginBottom: SPACING.sm },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  statusLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  steps: {
    width: "100%",
    gap: SPACING.sm,
    backgroundColor: COLORS.bg1,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.bg3,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: {
    backgroundColor: COLORS.success + "33",
    borderColor: COLORS.success,
  },
  stepDotActive: {
    backgroundColor: COLORS.accent + "22",
    borderColor: COLORS.accent,
  },
  checkMark: { color: COLORS.success, fontSize: 14, fontWeight: "700" },
  stepLabel: { color: COLORS.textMuted, fontSize: 14 },
  stepLabelDone: { color: COLORS.textSecondary },
  stepLabelActive: { color: COLORS.textPrimary, fontWeight: "600" },
  retryBtn: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.bg1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryText: { color: COLORS.accent, fontSize: 14, fontWeight: "600" },
});
