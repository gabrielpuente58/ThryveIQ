import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../../components/Screen";
import { Input } from "../../components/Input";
import { Card } from "../../components/Card";
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

export default function ChatScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const pendingContextRef = useRef<string>("");

  // On tab focus, check for a pending "Ask Coach" workout context
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingWorkoutChat();
      if (!pending || !user) return;
      pendingContextRef.current = pending.workoutContext;
      // Auto-send the pre-built message with workout context
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

      // Clear context after first use
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

  const handleSend = () => sendMessage(inputText);

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.messageContainer, item.isUser ? styles.userContainer : styles.aiContainer]}>
      <Card style={[styles.bubble, item.isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.messageText, item.isUser && styles.userMessageText]}>
          {item.text}
        </Text>
      </Card>
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.title}>AI Coach</Text>
          <Text style={styles.subtitle}>Your personal triathlon trainer</Text>
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
        />

        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <View style={styles.inputWrapper}>
              <Input
                value={inputText}
                onChangeText={setInputText}
                placeholder="Ask your coach anything..."
                multiline
                style={styles.input}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
            </View>
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
              onPress={() => { Keyboard.dismiss(); handleSend(); }}
              disabled={!inputText.trim() || isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Ionicons name="send" size={20} color={colors.background} />
              )}
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
      padding: SPACING.md,
      paddingTop: SPACING.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.mediumGray,
    },
    title: { fontSize: FONT_SIZES.xxl, fontWeight: "bold", color: colors.white, marginBottom: SPACING.xs },
    subtitle: { fontSize: FONT_SIZES.sm, color: colors.lightGray },
    messageList: { flex: 1 },
    messageListContent: { padding: SPACING.md, paddingBottom: SPACING.lg },
    messageContainer: { marginBottom: SPACING.md, maxWidth: "80%" },
    userContainer: { alignSelf: "flex-end" },
    aiContainer: { alignSelf: "flex-start" },
    bubble: { padding: SPACING.md },
    userBubble: { backgroundColor: colors.primary },
    aiBubble: { backgroundColor: colors.mediumGray },
    messageText: { fontSize: FONT_SIZES.md, color: colors.white, lineHeight: 22 },
    userMessageText: { color: colors.background },
    inputContainer: {
      padding: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: colors.mediumGray,
      backgroundColor: colors.background,
    },
    inputRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm },
    inputWrapper: { flex: 1 },
    input: { maxHeight: 100 },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },
    sendButtonDisabled: { opacity: 0.4 },
  });
