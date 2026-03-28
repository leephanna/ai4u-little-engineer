import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../store/authStore";
import { getBillingStatus, getCheckoutUrl } from "../../services/api";
import { COLORS, SPACING, PLAN_LIMITS } from "../../constants";
import type { BillingStatus } from "../../types";

interface Props {
  onNavigateBack: () => void;
}

export function BillingScreen({ onNavigateBack }: Props) {
  const { user } = useAuthStore();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getBillingStatus(user.accessToken)
      .then(setBilling)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  const handleUpgrade = async (plan: "maker" | "pro") => {
    if (!user) return;
    setUpgrading(plan);
    try {
      const { url } = await getCheckoutUrl(plan, user.accessToken);
      await Linking.openURL(url);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setUpgrading(null);
    }
  };

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "$0/mo",
      limit: `${PLAN_LIMITS.free} generations/month`,
      features: ["3 CAD generations/month", "STL + STEP download", "Basic support"],
      cta: null,
    },
    {
      id: "maker",
      name: "Maker",
      price: "$9/mo",
      limit: `${PLAN_LIMITS.maker} generations/month`,
      features: [
        "25 CAD generations/month",
        "STL + STEP download",
        "Priority generation",
        "Email support",
      ],
      cta: "maker" as const,
    },
    {
      id: "pro",
      name: "Pro",
      price: "$29/mo",
      limit: "Unlimited",
      features: [
        "Unlimited generations",
        "STL + STEP download",
        "Priority generation",
        "Dedicated support",
        "API access",
      ],
      cta: "pro" as const,
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onNavigateBack}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Billing & Plans</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : billing ? (
          <>
            {/* Current usage */}
            <View style={styles.usageCard}>
              <Text style={styles.usageTitle}>This Month</Text>
              <View style={styles.usageRow}>
                <Text style={styles.usageCount}>
                  {billing.generations_this_month}
                </Text>
                <Text style={styles.usageOf}>
                  / {billing.generations_limit ?? "∞"} generations
                </Text>
              </View>
              {billing.generations_limit && (
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(
                          100,
                          (billing.generations_this_month /
                            billing.generations_limit) *
                            100
                        )}%`,
                        backgroundColor:
                          billing.generations_this_month >=
                          billing.generations_limit
                            ? COLORS.error
                            : COLORS.accent,
                      },
                    ]}
                  />
                </View>
              )}
              <Text style={styles.currentPlan}>
                Current plan:{" "}
                <Text style={styles.planName}>{billing.plan.toUpperCase()}</Text>
              </Text>
            </View>

            {/* Plan cards */}
            {plans.map((plan) => {
              const isCurrent = billing.plan === plan.id;
              return (
                <View
                  key={plan.id}
                  style={[styles.planCard, isCurrent && styles.planCardCurrent]}
                >
                  <View style={styles.planHeader}>
                    <View>
                      <Text style={styles.planName2}>{plan.name}</Text>
                      <Text style={styles.planLimit}>{plan.limit}</Text>
                    </View>
                    <Text style={styles.planPrice}>{plan.price}</Text>
                  </View>
                  <View style={styles.featureList}>
                    {plan.features.map((f) => (
                      <Text key={f} style={styles.featureItem}>
                        ✓ {f}
                      </Text>
                    ))}
                  </View>
                  {isCurrent ? (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>Current Plan</Text>
                    </View>
                  ) : plan.cta ? (
                    <TouchableOpacity
                      style={[
                        styles.upgradeBtn,
                        upgrading === plan.cta && styles.upgradeBtnLoading,
                      ]}
                      onPress={() => handleUpgrade(plan.cta!)}
                      disabled={!!upgrading}
                    >
                      {upgrading === plan.cta ? (
                        <ActivityIndicator color={COLORS.textInverse} />
                      ) : (
                        <Text style={styles.upgradeBtnText}>
                          Upgrade to {plan.name}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg0 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { color: COLORS.accent, fontSize: 16 },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  scroll: { padding: SPACING.md, gap: SPACING.md },
  errorText: { color: COLORS.error, textAlign: "center", marginTop: 40 },
  usageCard: {
    backgroundColor: COLORS.bg1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  usageTitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  usageRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  usageCount: {
    fontSize: 36,
    fontWeight: "700",
    color: COLORS.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  usageOf: { fontSize: 16, color: COLORS.textSecondary },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.bg3,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  currentPlan: { fontSize: 13, color: COLORS.textSecondary },
  planName: { color: COLORS.accentGlow, fontWeight: "700" },
  planCard: {
    backgroundColor: COLORS.bg1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  planCardCurrent: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + "11",
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  planName2: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  planLimit: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  planPrice: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.accentGlow,
  },
  featureList: { gap: 4 },
  featureItem: { color: COLORS.textSecondary, fontSize: 13 },
  currentBadge: {
    backgroundColor: COLORS.accent + "22",
    borderRadius: 6,
    padding: SPACING.sm,
    alignItems: "center",
  },
  currentBadgeText: { color: COLORS.accent, fontWeight: "600", fontSize: 13 },
  upgradeBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    padding: SPACING.sm,
    alignItems: "center",
  },
  upgradeBtnLoading: { opacity: 0.7 },
  upgradeBtnText: { color: COLORS.textInverse, fontWeight: "700", fontSize: 14 },
});
