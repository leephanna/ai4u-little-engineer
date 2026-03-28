/**
 * PrintFeedbackModal
 *
 * Post-download prompt shown to the user after they download a CAD artifact.
 * Collects print quality feedback and submits to /api/mobile/print-feedback.
 *
 * Usage:
 *   <PrintFeedbackModal
 *     visible={showFeedback}
 *     artifactId={artifact.id}
 *     jobId={job.id}
 *     onClose={() => setShowFeedback(false)}
 *   />
 */

import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useAuthStore } from "../../store/authStore";
import { API_BASE_URL } from "../../constants";

interface PrintFeedbackModalProps {
  visible: boolean;
  artifactId: string;
  jobId: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

type FitQuality = "too_tight" | "perfect" | "too_loose";
type SurfaceQuality = "excellent" | "good" | "acceptable" | "poor";

const STAR_COUNT = 5;

export function PrintFeedbackModal({
  visible,
  artifactId,
  jobId,
  onClose,
  onSubmitted,
}: PrintFeedbackModalProps) {
  const { session } = useAuthStore();
  const [printedSuccessfully, setPrintedSuccessfully] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const [fitQuality, setFitQuality] = useState<FitQuality | null>(null);
  const [surfaceQuality, setSurfaceQuality] = useState<SurfaceQuality | null>(null);
  const [notes, setNotes] = useState("");
  const [printerType, setPrinterType] = useState("");
  const [material, setMaterial] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = printedSuccessfully !== null && rating > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !session?.access_token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/mobile/print-feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          artifact_id: artifactId,
          job_id: jobId,
          printed_successfully: printedSuccessfully,
          rating,
          fit_quality: fitQuality,
          surface_quality: surfaceQuality,
          notes: notes.trim() || null,
          printer_type: printerType.trim() || null,
          material: material.trim() || null,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      onSubmitted?.();
      onClose();
    } catch (err) {
      Alert.alert("Error", "Failed to submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <Text style={styles.title}>How did the print go?</Text>
            <Text style={styles.subtitle}>
              Your feedback helps improve future designs for everyone.
            </Text>

            {/* Printed successfully? */}
            <Text style={styles.sectionLabel}>Did it print successfully?</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.toggleBtn, printedSuccessfully === true && styles.toggleBtnActive]}
                onPress={() => setPrintedSuccessfully(true)}
              >
                <Text style={[styles.toggleText, printedSuccessfully === true && styles.toggleTextActive]}>
                  ✓ Yes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, printedSuccessfully === false && styles.toggleBtnFail]}
                onPress={() => setPrintedSuccessfully(false)}
              >
                <Text style={[styles.toggleText, printedSuccessfully === false && styles.toggleTextActive]}>
                  ✗ No
                </Text>
              </TouchableOpacity>
            </View>

            {/* Star rating */}
            <Text style={styles.sectionLabel}>Overall rating</Text>
            <View style={styles.starsRow}>
              {Array.from({ length: STAR_COUNT }, (_, i) => (
                <TouchableOpacity key={i} onPress={() => setRating(i + 1)}>
                  <Text style={[styles.star, i < rating && styles.starFilled]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Fit quality */}
            <Text style={styles.sectionLabel}>Fit quality (optional)</Text>
            <View style={styles.row}>
              {(["too_tight", "perfect", "too_loose"] as FitQuality[]).map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[styles.chipBtn, fitQuality === q && styles.chipBtnActive]}
                  onPress={() => setFitQuality(fitQuality === q ? null : q)}
                >
                  <Text style={[styles.chipText, fitQuality === q && styles.chipTextActive]}>
                    {q === "too_tight" ? "Too Tight" : q === "perfect" ? "Perfect" : "Too Loose"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Surface quality */}
            <Text style={styles.sectionLabel}>Surface quality (optional)</Text>
            <View style={styles.row}>
              {(["excellent", "good", "acceptable", "poor"] as SurfaceQuality[]).map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[styles.chipBtn, surfaceQuality === q && styles.chipBtnActive]}
                  onPress={() => setSurfaceQuality(surfaceQuality === q ? null : q)}
                >
                  <Text style={[styles.chipText, surfaceQuality === q && styles.chipTextActive]}>
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Printer type */}
            <Text style={styles.sectionLabel}>Printer type (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. FDM, SLA, SLS"
              placeholderTextColor="#666"
              value={printerType}
              onChangeText={setPrinterType}
            />

            {/* Material */}
            <Text style={styles.sectionLabel}>Material (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. PLA, PETG, ABS"
              placeholderTextColor="#666"
              value={material}
              onChangeText={setMaterial}
            />

            {/* Notes */}
            <Text style={styles.sectionLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Any other feedback..."
              placeholderTextColor="#666"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitText}>Submit Feedback</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#1a1a2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "90%",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#aaa",
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ccc",
    marginBottom: 8,
    marginTop: 16,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  toggleBtnActive: {
    backgroundColor: "#00c896",
    borderColor: "#00c896",
  },
  toggleBtnFail: {
    backgroundColor: "#e74c3c",
    borderColor: "#e74c3c",
  },
  toggleText: {
    color: "#aaa",
    fontWeight: "600",
    fontSize: 15,
  },
  toggleTextActive: {
    color: "#fff",
  },
  starsRow: {
    flexDirection: "row",
    gap: 8,
  },
  star: {
    fontSize: 36,
    color: "#444",
  },
  starFilled: {
    color: "#f4c542",
  },
  chipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 4,
  },
  chipBtnActive: {
    backgroundColor: "#6c63ff",
    borderColor: "#6c63ff",
  },
  chipText: {
    color: "#aaa",
    fontSize: 13,
  },
  chipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#0d0d1a",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    fontSize: 14,
  },
  textArea: {
    height: 80,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    marginBottom: 8,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  skipText: {
    color: "#aaa",
    fontWeight: "600",
    fontSize: 15,
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#6c63ff",
    alignItems: "center",
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
