import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Screen } from "../components/Screen";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from "../constants/theme";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hi! I'm your AI triathlon coach. How can I help you today?",
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    // Simulate AI response (replace with actual API call later)
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "I'm here to help with your triathlon training! This is a placeholder response. We'll connect to the AI backend soon.",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageContainer,
        item.isUser ? styles.userMessageContainer : styles.aiMessageContainer,
      ]}
    >
      <Card
        style={[
          styles.messageBubble,
          item.isUser ? styles.userBubble : styles.aiBubble,
        ]}
      >
        <Text style={styles.messageText}>{item.text}</Text>
        <Text style={styles.timestamp}>
          {item.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </Card>
    </View>
  );

  return (
    <Screen style={styles.screen}>
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
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <Input
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask your coach anything..."
            multiline
            style={styles.input}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <View style={styles.sendButtonContainer}>
            <Button
              title="Send"
              onPress={handleSend}
              loading={isLoading}
              disabled={!inputText.trim()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 0,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.mediumGray,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.lightGray,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  messageContainer: {
    marginBottom: SPACING.md,
    maxWidth: "80%",
  },
  userMessageContainer: {
    alignSelf: "flex-end",
  },
  aiMessageContainer: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    padding: SPACING.md,
  },
  userBubble: {
    backgroundColor: COLORS.primary,
  },
  aiBubble: {
    backgroundColor: COLORS.mediumGray,
  },
  messageText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.lightGray,
    marginTop: SPACING.xs,
    opacity: 0.7,
  },
  inputContainer: {
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.mediumGray,
    backgroundColor: COLORS.background,
  },
  input: {
    marginBottom: SPACING.sm,
    maxHeight: 100,
  },
  sendButtonContainer: {
    alignSelf: "flex-end",
    minWidth: 100,
  },
});
