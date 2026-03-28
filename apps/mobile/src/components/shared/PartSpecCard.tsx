/**
 * PartSpecCard — shows the current part spec draft live as it is built.
 * Updates in real time as the conversation progresses.
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { COLORS, SPACING, PART_FAMILY_LABELS, REQUIRED_DIMENSIONS } from "../../constants";
import type { PartSpecDraft } from "../../types";
import type { MvpPartFamily } from "../../constants";

interface Props {
  spec: PartSpecDraft;
  onEditField?: (field: string, currentValue?: number) => void;
  compact?: boolean;
}

export function PartSpecCard({ spec, onEditField, compact = false }: Props) {
  const family = spec.family as MvpPartFamily | null;
  const required = family ? REQUIRED_DIMENSIONS[family] ?? [] : [];
  const allFields = required.length > 0 ? required : Object.keys(spec.dimensions);

  if (!family && Object.keys(spec.dimensions).length === 0) {
    return (
      <View style={[styles.card, styles.emptyCard]}>
        <Text style={styles.emptyText}>No part spec yet</Text>
        <Text style={styles.emptySubtext}>Start speaking to design a part</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.familyLabel}>
          {family ? PART_FAMILY_LABELS[family] : "Unknown Part"}
        </Text>
        <Text style={styles.unitsLabel}>{spec.units.toUpperCase()}</Text>
      </View>

      {!compact && (
        <View style={styles.dimensions}>
          {allFields.map((field) => {
            const value = spec.dimensions[field];
            const hasValue = value !== undefined && !isNaN(value);
            return (
              <TouchableOpacity
                key={field}
                style={[styles.dimRow, !hasValue && styles.dimRowMissing]}
                onPress={() => onEditField?.(field, value)}
                disabled={!onEditField}
              >
                <Text style={styles.dimKey}>
                  {field.replace(/_/g, " ")}
                </Text>
                <Text style={[styles.dimValue, !hasValue && styles.dimValueMissing]}>
                  {hasValue ? `${value} ${spec.units}` : "—"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {compact && (
        <Text style={styles.compactSummary}>
          {Object.entries(spec.dimensions)
            .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}${spec.units}`)
            .join(" · ")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bg1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: SPACING.lg,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "500",
  },
  emptySubtext: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  familyLabel: {
    color: COLORS.accentGlow,
    fontSize: 15,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  unitsLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    backgroundColor: COLORS.bg3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dimensions: { gap: 6 },
  dimRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.bg2,
    borderRadius: 6,
  },
  dimRowMissing: {
    borderWidth: 1,
    borderColor: COLORS.warning + "44",
    borderStyle: "dashed",
  },
  dimKey: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textTransform: "capitalize",
  },
  dimValue: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  dimValueMissing: {
    color: COLORS.warning,
  },
  compactSummary: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
