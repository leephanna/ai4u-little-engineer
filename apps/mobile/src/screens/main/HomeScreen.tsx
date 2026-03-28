/**
 * HomeScreen — the primary voice conversation interface.
 *
 * This is the core of the app: a conversational CAD designer.
 * The user holds the mic button to speak, the assistant interprets
 * and asks follow-up questions, and the spec card updates live.
 */
import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConversationStore } from "../../store/conversationStore";
import { useAuthStore } from "../../store/authStore";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { useConversationEngine } from "../../hooks/useConversationEngine";
import { MicButton } from "../../components/conversation/MicButton";
import { ConversationBubble } from "../../components/conversation/ConversationBubble";
import { PartSpecCard } from "../../components/shared/PartSpecCard";
import { COLORS, SPACING, WELCOME_MESSAGE } from "../../constants";

interface Props {
  onNavigateToProgress: () => void;
  onNavigateToSettings: () => void;
}

export function HomeScreen({ onNavigateToProgress, onNavigateToSettings }: Props) {
  const store = useConversationStore();
  const { user } = useAuthStore();
  const { recordingState, startRecording, stopRecording, cancelRecording, error: recError } =
    useVoiceRecorder();
  const { processVoiceInput, processTextInput, confirmAndGenerate, addAssistantMessage } =
    useConversationEngine();

  const [textInput, setTextInput] = useState("");
  const flatListRef = useRef<FlatList>(null);

  // Show welcome message on first load
  useEffect(() => {
    if (store.messages.length === 0) {
      addAssistantMessage(WELCOME_MESSAGE, false);
    }
  }, []);

  // Navigate to progress when generation starts
  useEffect(() => {
    if (store.state === "GENERATING" && store.currentJobId) {
      onNavigateToProgress();
    }
  }, [store.state, store.currentJobId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (store.messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [store.messages.length]);

  const handleMicPressIn = async () => {
    if (store.state === "GENERATING") return;
    await startRecording();
    store.setState("LISTENING");
  };

  const handleMicPressOut = async () => {
    const uri = await stopRecording();
    if (uri) {
      store.addMessage({ role: "user", text: "🎙️ Voice input...", isVoice: true });
      await processVoiceInput(uri);
    } else {
      store.setState("IDLE");
    }
  };

  const handleTextSend = async () => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    await processTextInput(text);
  };

  const handleConfirm = () => {
    Alert.alert(
      "Confirm Generation",
      "Generate this part now? This will use one of your monthly generations.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Generate", style: "default", onPress: confirmAndGenerate },
      ]
    );
  };

  const handleStartOver = () => {
    Alert.alert("Start Over", "Clear the current spec and start a new design?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Start Over",
        style: "destructive",
        onPress: () => {
          store.resetConversation();
          addAssistantMessage("Starting fresh! What part do you need?");
        },
      },
    ]);
  };

  const isReviewing =
    store.state === "REVIEWING_SPEC" || store.state === "CONFIRMING_GENERATION";
  const specComplete = store.isSpecComplete();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Little Engineer</Text>
        <TouchableOpacity onPress={onNavigateToSettings}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Spec Card */}
      <View style={styles.specCardWrapper}>
        <PartSpecCard
          spec={store.spec}
          onEditField={(field, value) => {
            // Prompt user to edit a specific field
            Alert.prompt(
              `Edit ${field.replace(/_/g, " ")}`,
              `Current: ${value !== undefined ? `${value} ${store.spec.units}` : "not set"}`,
              (text) => {
                const num = parseFloat(text);
                if (!isNaN(num)) {
                  store.updateSpec({ dimensions: { [field]: num } });
                }
              },
              "plain-text",
              value !== undefined ? String(value) : ""
            );
          }}
        />
      </View>

      {/* Conversation */}
      <KeyboardAvoidingView
        style={styles.conversationArea}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={120}
      >
        <FlatList
          ref={flatListRef}
          data={store.messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ConversationBubble message={item} />}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
        />

        {/* State indicator */}
        {store.state !== "IDLE" && store.state !== "REVIEWING_SPEC" && (
          <View style={styles.stateBar}>
            <Text style={styles.stateText}>{getStateLabel(store.state)}</Text>
          </View>
        )}

        {/* Confirm + Start Over buttons when spec is complete */}
        {isReviewing && specComplete && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.startOverBtn} onPress={handleStartOver}>
              <Text style={styles.startOverText}>Start Over</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.generateBtn} onPress={handleConfirm}>
              <Text style={styles.generateText}>Generate Part →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Text input + Mic */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={textInput}
            onChangeText={setTextInput}
            placeholder="Or type here..."
            placeholderTextColor={COLORS.textMuted}
            onSubmitEditing={handleTextSend}
            returnKeyType="send"
            multiline={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !textInput.trim() && styles.sendBtnDisabled]}
            onPress={handleTextSend}
            disabled={!textInput.trim()}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.micRow}>
          <MicButton
            recordingState={recordingState}
            onPressIn={handleMicPressIn}
            onPressOut={handleMicPressOut}
            disabled={store.state === "GENERATING" || store.state === "INTERPRETING"}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStateLabel(state: string): string {
  const labels: Record<string, string> = {
    LISTENING: "🎙️ Listening...",
    TRANSCRIBING: "⏳ Transcribing...",
    INTERPRETING: "🤔 Interpreting...",
    ASKING_FOR_MISSING_FIELDS: "💬 Asking...",
    CONFIRMING_GENERATION: "🚀 Preparing...",
    GENERATING: "⚙️ Generating...",
    ERROR_RECOVERY: "⚠️ Error",
  };
  return labels[state] || state;
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
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  settingsIcon: { fontSize: 22 },
  specCardWrapper: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  conversationArea: { flex: 1 },
  messageList: {
    paddingVertical: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  stateBar: {
    alignItems: "center",
    paddingVertical: 6,
    backgroundColor: COLORS.bg1,
    marginHorizontal: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  stateText: { color: COLORS.textSecondary, fontSize: 13 },
  actionRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  startOverBtn: {
    flex: 1,
    padding: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  startOverText: { color: COLORS.textSecondary, fontSize: 14 },
  generateBtn: {
    flex: 2,
    padding: SPACING.sm,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: "center",
  },
  generateText: { color: COLORS.textInverse, fontSize: 14, fontWeight: "700" },
  inputRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.bg1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  sendBtnDisabled: { backgroundColor: COLORS.bg3 },
  sendIcon: { color: COLORS.textInverse, fontSize: 18, fontWeight: "700" },
  micRow: {
    alignItems: "center",
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
  },
});
