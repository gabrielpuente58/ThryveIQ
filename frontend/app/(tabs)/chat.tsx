import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Keyboard,
  TextInput,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../../components/Screen";
import { TypingIndicator } from "../../components/TypingIndicator";
import { ThemeColors, SPACING, BORDER_RADIUS, FONT_SIZES } from "../../constants/theme";
import { API_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { consumePendingWorkoutChat } from "../../lib/workoutChatContext";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

const GREETING: Message = {
  id: "1",
  text: "Hi! I'm your AI triathlon coach. Ask me anything about your training, workouts, or triathlon in general.",
  isUser: false,
  timestamp: new Date(),
};

const SUGGESTED_PROMPTS = [
  { icon: "calendar-outline" as const, text: "What's on my plan today?" },
  { icon: "speedometer-outline" as const, text: "What zones should I train in?" },
  { icon: "water-outline" as const, text: "How do I improve my swim?" },
  { icon: "stats-chart-outline" as const, text: "Summarize my recent activities" },
];

export default function ChatScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const pendingContextRef = useRef<string>("");

  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingWorkoutChat();
      if (!pending || !user) return;
      pendingContextRef.current = pending.workoutContext;
      sendMessage(pending.message, pending.workoutContext);
    }, [user])
  );

  const sendMessage = async (text: string, workoutContext: string = "") => {
    if (!text.trim() || !user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: text.trim(),
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== "1")
        .map((m) => ({ role: m.isUser ? "user" : "assistant", content: m.text }));

      const res = await fetch(`${API_URL}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.text,
          history,
          user_id: user.id,
          workout_context: workoutContext || pendingContextRef.current,
        }),
      });

      pendingContextRef.current = "";

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), text: data.response, isUser: false, timestamp: new Date() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: "Sorry, couldn't reach the server. Make sure the backend is running.",
          isUser: false,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    sendMessage(text);
  };

  // Web/laptop: Enter sends, Shift+Enter inserts newline.
  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS !== "web") return;
    const native = e.nativeEvent as unknown as KeyboardEvent;
    if (native.key === "Enter" && !native.shiftKey) {
      e.preventDefault?.();
      handleSend();
    }
  };

  const isEmptyConversation = messages.length === 1;

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const prev = index > 0 ? messages[index - 1] : null;
    const showAvatar = !item.isUser && (!prev || prev.isUser);
    return (
      <View style={[styles.messageRow, item.isUser ? styles.userRow : styles.aiRow]}>
        {!item.isUser && (
          <View style={styles.avatarSlot}>
            {showAvatar ? (
              <View style={styles.avatar}>
                <Ionicons name="pulse" size={12} color={colors.background} />
              </View>
            ) : null}
          </View>
        )}
        <View
          style={[
            styles.bubble,
            item.isUser ? styles.userBubble : styles.aiBubble,
          ]}
        >
          <Text style={[styles.messageText, item.isUser && styles.userMessageText]}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerAvatar}>
              <Ionicons name="pulse" size={14} color={colors.background} />
            </View>
            <View>
              <Text style={styles.title}>AI Coach</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.subtitle}>Online · Powered by Claude</Text>
              </View>
            </View>
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <>
              {isLoading && <TypingIndicator />}
              {isEmptyConversation && !isLoading && (
                <View style={styles.suggestionsWrapper}>
                  <Text style={styles.suggestionsLabel}>Try asking</Text>
                  <View style={styles.suggestionsList}>
                    {SUGGESTED_PROMPTS.map((p, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.suggestionRow}
                        onPress={() => sendMessage(p.text)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.suggestionIcon}>
                          <Ionicons name={p.icon} size={16} color={colors.primary} />
                        </View>
                        <Text style={styles.suggestionRowText}>{p.text}</Text>
                        <Ionicons name="arrow-up" size={14} color={colors.lightGray} style={styles.suggestionArrow} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </>
          }
        />

        <View style={styles.inputContainer}>
          <View style={styles.inputPill}>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Message your coach…"
              placeholderTextColor={colors.lightGray}
              multiline
              style={styles.input}
              onKeyPress={handleKeyPress}
              onSubmitEditing={Platform.OS !== "web" ? handleSend : undefined}
              returnKeyType="send"
              blurOnSubmit={Platform.OS !== "web"}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={() => {
                if (Platform.OS !== "web") Keyboard.dismiss();
                handleSend();
              }}
              disabled={!inputText.trim() || isLoading}
              activeOpacity={0.8}
            >
              <Ionicons
                name="arrow-up"
                size={18}
                color={!inputText.trim() || isLoading ? colors.lightGray : colors.background}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { padding: 0 },
    keyboardView: { flex: 1 },

    header: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.mediumGray,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    headerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: FONT_SIZES.lg,
      fontWeight: "700",
      color: colors.white,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#22C55E",
    },
    subtitle: {
      fontSize: FONT_SIZES.xs,
      color: colors.lightGray,
    },

    messageList: { flex: 1 },
    messageListContent: {
      padding: SPACING.md,
      paddingBottom: SPACING.lg,
      gap: SPACING.sm,
    },

    messageRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: SPACING.xs,
      maxWidth: "100%",
    },
    userRow: {
      justifyContent: "flex-end",
    },
    aiRow: {
      justifyContent: "flex-start",
    },
    avatarSlot: {
      width: 24,
      alignItems: "center",
    },
    avatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },

    bubble: {
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.md,
      maxWidth: "78%",
    },
    userBubble: {
      backgroundColor: colors.primary,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 4,
    },
    aiBubble: {
      backgroundColor: colors.mediumGray,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 4,
      borderBottomRightRadius: 18,
    },
    messageText: {
      fontSize: FONT_SIZES.md,
      color: colors.white,
      lineHeight: 22,
    },
    userMessageText: {
      color: colors.background,
    },

    suggestionsWrapper: {
      marginTop: SPACING.md,
      gap: SPACING.sm,
    },
    suggestionsLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: "700",
      color: colors.lightGray,
      textTransform: "uppercase",
      letterSpacing: 1,
      paddingHorizontal: SPACING.xs,
    },
    suggestionsList: {
      gap: SPACING.sm,
    },
    suggestionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      backgroundColor: colors.darkGray,
      borderWidth: 1,
      borderColor: colors.mediumGray,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
    },
    suggestionIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary + "20",
      alignItems: "center",
      justifyContent: "center",
    },
    suggestionRowText: {
      flex: 1,
      fontSize: FONT_SIZES.sm,
      color: colors.white,
      fontWeight: "500",
    },
    suggestionArrow: {
      transform: [{ rotate: "45deg" }],
    },

    inputContainer: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.mediumGray,
    },
    inputPill: {
      flexDirection: "row",
      alignItems: "flex-end",
      backgroundColor: colors.mediumGray,
      borderRadius: 24,
      paddingLeft: SPACING.md,
      paddingRight: 4,
      paddingVertical: 4,
      gap: SPACING.sm,
      minHeight: 48,
    },
    input: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      color: colors.white,
      paddingVertical: SPACING.sm,
      maxHeight: 120,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}),
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonDisabled: {
      backgroundColor: colors.darkGray,
    },
  });
