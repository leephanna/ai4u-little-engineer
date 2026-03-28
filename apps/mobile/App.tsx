/**
 * AI4U Little Engineer — Mobile App
 * Root navigation controller with auth guard.
 */
import React, { useEffect, useState } from "react";
import { StatusBar, View, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "./src/store/authStore";
import { SignInScreen } from "./src/screens/auth/SignInScreen";
import { SignUpScreen } from "./src/screens/auth/SignUpScreen";
import { HomeScreen } from "./src/screens/main/HomeScreen";
import { ProgressScreen } from "./src/screens/main/ProgressScreen";
import { ResultsScreen } from "./src/screens/main/ResultsScreen";
import { SettingsScreen } from "./src/screens/main/SettingsScreen";
import { BillingScreen } from "./src/screens/main/BillingScreen";
import { COLORS } from "./src/constants";
import type { JobStatusResponse } from "./src/types";

type Screen =
  | "sign-in"
  | "sign-up"
  | "home"
  | "progress"
  | "results"
  | "settings"
  | "billing";

export default function App() {
  const { user, loading, initialize } = useAuthStore();
  const [screen, setScreen] = useState<Screen>("sign-in");
  const [jobResult, setJobResult] = useState<JobStatusResponse | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (!loading) {
      setScreen(user ? "home" : "sign-in");
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg0} />
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  const renderScreen = () => {
    switch (screen) {
      case "sign-in":
        return <SignInScreen onNavigateToSignUp={() => setScreen("sign-up")} />;
      case "sign-up":
        return <SignUpScreen onNavigateToSignIn={() => setScreen("sign-in")} />;
      case "home":
        return (
          <HomeScreen
            onNavigateToProgress={() => setScreen("progress")}
            onNavigateToSettings={() => setScreen("settings")}
          />
        );
      case "progress":
        return (
          <ProgressScreen
            onNavigateToResults={(result) => {
              setJobResult(result);
              setScreen("results");
            }}
            onNavigateHome={() => setScreen("home")}
          />
        );
      case "results":
        return jobResult ? (
          <ResultsScreen
            result={jobResult}
            onNewDesign={() => {
              setJobResult(null);
              setScreen("home");
            }}
          />
        ) : null;
      case "settings":
        return (
          <SettingsScreen
            onNavigateToBilling={() => setScreen("billing")}
            onNavigateHome={() => setScreen("home")}
          />
        );
      case "billing":
        return <BillingScreen onNavigateBack={() => setScreen("settings")} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg0} />
      {renderScreen()}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg0,
    alignItems: "center",
    justifyContent: "center",
  },
});
