import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../store/authStore";
import { COLORS, SPACING, APP_VERSION } from "../../constants";

interface Props {
  onNavigateToBilling: () => void;
  onNavigateHome: () => void;
}

export function SettingsScreen({ onNavigateToBilling, onNavigateHome }: Props) {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const handleOpenDocs = () => {
    Linking.openURL("https://ai4u-little-engineer-web.vercel.app/docs");
  };

  const handleOpenSupport = () => {
    Linking.openURL("mailto:support@ai4utech.com?subject=Little%20Engineer%20Support");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onNavigateHome}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email || "—"}</Text>
          </View>
        </View>

        {/* Billing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <TouchableOpacity style={styles.menuItem} onPress={onNavigateToBilling}>
            <Text style={styles.menuItemText}>Manage Plan & Billing</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Help</Text>
          <TouchableOpacity style={styles.menuItem} onPress={handleOpenDocs}>
            <Text style={styles.menuItemText}>Documentation</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleOpenSupport}>
            <Text style={styles.menuItemText}>Contact Support</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Little Engineer v{APP_VERSION}</Text>
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
  section: {
    backgroundColor: COLORS.bg1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: 4,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  infoLabel: { color: COLORS.textSecondary, fontSize: 14 },
  infoValue: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "500" },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  menuItemText: { color: COLORS.textPrimary, fontSize: 15 },
  menuItemArrow: { color: COLORS.textMuted, fontSize: 18 },
  logoutBtn: {
    backgroundColor: COLORS.bg1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.error + "44",
    padding: SPACING.md,
    alignItems: "center",
  },
  logoutText: { color: COLORS.error, fontSize: 15, fontWeight: "600" },
  version: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: SPACING.sm,
  },
});
