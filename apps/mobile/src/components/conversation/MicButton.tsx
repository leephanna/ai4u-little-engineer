import React, { useEffect, useRef } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Animated,
  View,
  Text,
} from "react-native";
import { COLORS } from "../../constants";
import type { RecordingState } from "../../hooks/useVoiceRecorder";

interface Props {
  recordingState: RecordingState;
  onPressIn: () => void;
  onPressOut: () => void;
  disabled?: boolean;
}

export function MicButton({ recordingState, onPressIn, onPressOut, disabled }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isRecording = recordingState === "recording";

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isRecording, pulseAnim]);

  const bgColor = isRecording
    ? COLORS.micActive
    : recordingState === "processing"
    ? COLORS.micListening
    : COLORS.micIdle;

  const label = isRecording
    ? "Release to send"
    : recordingState === "processing"
    ? "Processing..."
    : "Hold to speak";

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.pulseRing,
          isRecording && styles.pulseRingActive,
          { transform: [{ scale: pulseAnim }] },
        ]}
      />
      <TouchableOpacity
        style={[styles.button, { backgroundColor: bgColor }, disabled && styles.disabled]}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled || recordingState === "processing"}
        activeOpacity={0.85}
      >
        <Text style={styles.micIcon}>
          {isRecording ? "🔴" : recordingState === "processing" ? "⏳" : "🎙️"}
        </Text>
      </TouchableOpacity>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", gap: 8 },
  pulseRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "transparent",
  },
  pulseRingActive: {
    borderColor: COLORS.micActive + "66",
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  disabled: { opacity: 0.4 },
  micIcon: { fontSize: 32 },
  label: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
});
