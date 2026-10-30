import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { COACH_TOOLS } from '@shared/coach/chat';

import { Text } from '@/components/ui/text';
import { oneOf } from '@/lib/one-of';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import type { ChatMessage, ChatStatus } from './use-chat';

type ChatMessagesProps = {
  messages: ChatMessage[];
  status: ChatStatus;
  /** The tool Bite is looking something up with. */
  tool?: string;
  /** Asks an unanswered question again; without it, as when the user may not ask, it is not offered. */
  onAskAgain?: (question: ChatMessage) => void;
};

/**
 * The conversation: the user's messages in bubbles, Bite's as text after its face. Bite's last
 * message thinks while it waits, with what it is looking up, and talks while its text comes
 * (boards 2 and 3).
 */
export function ChatMessages({ messages, status, tool, onAskAgain }: ChatMessagesProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      {messages.map((message, index) => {
        const last = index === messages.length - 1;
        if (message.role === 'user') {
          return <UserMessage key={message.id} message={message} onAskAgain={onAskAgain} />;
        }
        if (last && status === 'thinking' && !message.text) {
          return <Thinking key={message.id} tool={tool} />;
        }
        return (
          <BiteMessage key={message.id} message={message} talking={last && status !== 'idle'} />
        );
      })}
      {/* A lookup after Bite started writing shows under what it wrote. */}
      {status === 'answering' && tool ? <ToolLine tool={tool} indent /> : null}
    </View>
  );
}

// Each message renders again only when it changes, as only the last one does while Bite writes.
const UserMessage = memo(function UserMessage({
  message,
  onAskAgain,
}: {
  message: ChatMessage;
  onAskAgain?: (question: ChatMessage) => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.user, { gap: spacing.xs }]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: colors.userBubble,
            paddingHorizontal: spacing.md + 2,
            paddingVertical: spacing.sm + 2,
          },
        ]}
      >
        <Text>{message.text}</Text>
      </View>
      {message.unanswered ? (
        <View style={[styles.row, { gap: spacing.xs }]}>
          <Text variant="caption" color="textMuted">
            {t('bite.unanswered')}
          </Text>
          {onAskAgain ? (
            <>
              <Text variant="caption" color="textMuted" aria-hidden>
                ·
              </Text>
              <Pressable
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => onAskAgain(message)}
              >
                <Text variant="captionStrong" color="primaryText">
                  {t('bite.askAgain')}
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const BiteMessage = memo(function BiteMessage({
  message,
  talking,
}: {
  message: ChatMessage;
  talking: boolean;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const expression = message.expression ?? 'neutral';
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={[styles.bite, { gap: spacing.md - 2 }]}>
        {talking ? (
          <BiteAvatar size={32} expression={expression} state="talking" />
        ) : (
          <BiteAvatar size={32} expression={expression} />
        )}
        <View
          style={[
            styles.biteBubble,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingHorizontal: spacing.md + 2,
              paddingVertical: spacing.sm + 2,
            },
          ]}
        >
          <Text>{message.text}</Text>
        </View>
      </View>
      {/* An answer that stopped short says so, under it. */}
      {message.cut ? (
        <Text variant="caption" color="textMuted" style={styles.under}>
          {t(message.cut === 'stopped' ? 'bite.stopped' : 'bite.cutOff')}
        </Text>
      ) : null}
    </View>
  );
});

function Thinking({ tool }: { tool?: string }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.md - 2 }]}>
      <BiteAvatar size={32} state="thinking" />
      <ToolLine tool={tool} />
    </View>
  );
}

/** Bite's dots, and what it looks up, if it says; `indent` lines it up with Bite's messages. */
function ToolLine({ tool, indent = false }: { tool?: string; indent?: boolean }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const known = oneOf(COACH_TOOLS, tool);
  const line = known ? t(`bite.tools.${known}`) : undefined;
  return (
    <View
      style={[styles.row, styles.flex, { gap: spacing.md - 2, marginLeft: indent ? 42 : 0 }]}
      accessible
      accessibilityLabel={line ?? t('bite.thinking')}
      accessibilityLiveRegion="polite"
    >
      <Dots />
      {line ? (
        <Text variant="captionStrong" color="textMuted" style={styles.flex}>
          {line}
        </Text>
      ) : null}
    </View>
  );
}

/** Three dots that light up one after another while Bite thinks. */
function Dots() {
  const { colors } = useTheme();
  return (
    <View style={styles.dots} aria-hidden>
      {[0, 1, 2].map((index) => (
        <Dot key={index} delay={index * 200} color={colors.textMuted} />
      ))}
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 0.6 : 0.25);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 600 }), withTiming(0.25, { duration: 600 })),
        -1,
      ),
    );
  }, [delay, opacity, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  user: {
    alignItems: 'flex-end',
  },
  /** Under Bite's answer, past its face. */
  under: {
    marginLeft: 42,
  },
  bubble: {
    maxWidth: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 6,
  },
  bite: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  /** Bite's answer on a card, its corner by Bite's face sharper, as the user's is by its edge. */
  biteBubble: {
    flexShrink: 1,
    borderWidth: 1,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
