import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, SPACING } from "../../constants";
import type { ConversationMessage } from "../../types";

interface Props {
  message: ConversationMessage;
}

export function ConversationBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser && <Text style={styles.avatar}>⚙️</Text>}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        <Text style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}>
          {message.text}
        </Text>
        {message.isVoice && isUser && (
          <Text style={styles.voiceTag}>🎙️ voice</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginVertical: 4,
    paddingHorizontal: SPACING.md,
    gap: 8,
  },
  rowUser: { justifyContent: "flex-end" },
  rowAssistant: { justifyContent: "flex-start", alignItems: "flex-end" },
  avatar: { fontSize: 20, marginBottom: 2 },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  bubbleUser: {
    backgroundColor: COLORS.accentDim,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.bg2,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  text: { fontSize: 15, lineHeight: 22 },
  textUser: { color: COLORS.textPrimary },
  textAssistant: { color: COLORS.textPrimary },
  voiceTag: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
  },
});
