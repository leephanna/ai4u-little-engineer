/**
 * ResultsScreen — displays generated artifacts with download links.
 * Shows STL and STEP file sizes, signed URLs, and a "New Design" button.
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConversationStore } from "../../store/conversationStore";
import { COLORS, SPACING } from "../../constants";
import type { JobStatusResponse } from "../../types";

interface Props {
  result: JobStatusResponse;
  onNewDesign: () => void;
}

export function ResultsScreen({ result, onNewDesign }: Props) {
  const store = useConversationStore();
  const { job, artifacts, download_urls } = result;

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownload = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
  };

  const handleNewDesign = () => {
    store.resetConversation();
    onNewDesign();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Success header */}
        <View style={styles.successHeader}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>Part Generated!</Text>
          <Text style={styles.successSubtitle}>
            {job.family?.replace(/_/g, " ")} — {job.units}
          </Text>
        </View>

        {/* Artifacts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Download Files</Text>
          {artifacts.length === 0 ? (
            <Text style={styles.emptyText}>No artifacts available yet.</Text>
          ) : (
            artifacts.map((artifact) => {
              const url = download_urls[artifact.id];
              const ext = artifact.file_format?.toUpperCase() ?? "FILE";
              const isStl = ext === "STL";
              return (
                <View key={artifact.id} style={styles.artifactCard}>
                  <View style={styles.artifactInfo}>
                    <View style={[styles.extBadge, isStl ? styles.extBadgeStl : styles.extBadgeStep]}>
                      <Text style={styles.extText}>{ext}</Text>
                    </View>
                    <View>
                      <Text style={styles.artifactName}>
                        {artifact.variant_type || ext} File
                      </Text>
                      <Text style={styles.artifactSize}>
                        {formatBytes(artifact.file_size_bytes || 0)}
                      </Text>
                    </View>
                  </View>
                  {url ? (
                    <TouchableOpacity
                      style={styles.downloadBtn}
                      onPress={() => handleDownload(url)}
                    >
                      <Text style={styles.downloadText}>↓ Download</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.noUrlText}>URL expired</Text>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Spec summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Part Specification</Text>
          <View style={styles.specGrid}>
            {Object.entries(job.dimensions || {}).map(([k, v]) => (
              <View key={k} style={styles.specRow}>
                <Text style={styles.specKey}>{k.replace(/_/g, " ")}</Text>
                <Text style={styles.specVal}>{v} {job.units}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* New design button */}
        <TouchableOpacity style={styles.newDesignBtn} onPress={handleNewDesign}>
          <Text style={styles.newDesignText}>⚙️  Design Another Part</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg0 },
  scroll: { padding: SPACING.md, gap: SPACING.md },
  successHeader: {
    alignItems: "center",
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.bg1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.success + "44",
  },
  successIcon: { fontSize: 48, marginBottom: SPACING.sm },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  successSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    textTransform: "capitalize",
  },
  section: {
    backgroundColor: COLORS.bg1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  artifactCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.bg2,
    borderRadius: 8,
    padding: SPACING.sm,
  },
  artifactInfo: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  extBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 44,
    alignItems: "center",
  },
  extBadgeStl: { backgroundColor: COLORS.accent + "33" },
  extBadgeStep: { backgroundColor: COLORS.success + "33" },
  extText: { color: COLORS.textPrimary, fontSize: 11, fontWeight: "700" },
  artifactName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" },
  artifactSize: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  downloadBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 6,
  },
  downloadText: { color: COLORS.textInverse, fontSize: 13, fontWeight: "600" },
  noUrlText: { color: COLORS.textMuted, fontSize: 12 },
  specGrid: { gap: 6 },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  specKey: { color: COLORS.textSecondary, fontSize: 13, textTransform: "capitalize" },
  specVal: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "600" },
  newDesignBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  newDesignText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
