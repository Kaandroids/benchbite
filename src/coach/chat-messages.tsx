import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import type { ChatMessage, ChatStatus } from './use-chat';

/** The tools Bite looks things up with, each with its line while it does (ADR 0052). */
const TOOLS = [
  'get_workout_history',
  'get_meal_log',
  'get_week_summary',
  'get_records',
  'search_foods',
  'search_exercises',
] as const;
type Tool = (typeof TOOLS)[number];

const isTool = (name?: string): name is Tool => TOOLS.some((tool) => tool === name);

type ChatMessagesProps = {
  messages: ChatMessage[];
  status: ChatStatus;
  /** The tool Bite is looking something up with. */
  tool?: string;
};

/**
 * The conversation: the user's messages in bubbles, Bite's as text after its face. Bite's last
 * message thinks while it waits, with what it is looking up, and talks while its text comes
 * (boards 2 and 3).
 */
export function ChatMessages({ messages, status, tool }: ChatMessagesProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      {messages.map((message, index) => {
        const last = index === messages.length - 1;
        if (message.role === 'user') return <UserMessage key={message.id} text={message.text} />;
        if (last && status === 'thinking' && !message.text) {
          return <Thinking key={message.id} tool={tool} />;
        }
        return (
          <BiteMessage key={message.id} message={message} talking={last && status !== 'idle'} />
        );
      })}
    </View>
  );
}

function UserMessage({ text }: { text: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.bubble,
        {
          backgroundColor: colors.iconBackground,
          paddingHorizontal: spacing.md + 2,
          paddingVertical: spacing.sm + 2,
        },
      ]}
    >
      <Text>{text}</Text>
    </View>
  );
}

function BiteMessage({ message, talking }: { message: ChatMessage; talking: boolean }) {
  const { spacing } = useTheme();
  const expression = message.expression ?? 'neutral';
  return (
    <View style={[styles.bite, { gap: spacing.md - 2 }]}>
      {talking ? (
        <BiteAvatar size={32} expression={expression} state="talking" />
      ) : (
        <BiteAvatar size={32} expression={expression} />
      )}
      <Text style={[styles.flex, styles.biteText]}>{message.text}</Text>
    </View>
  );
}

function Thinking({ tool }: { tool?: string }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const line = isTool(tool) ? t(`bite.tools.${tool}`) : undefined;
  return (
    <View
      style={[styles.thinking, { gap: spacing.md - 2 }]}
      accessible
      accessibilityLabel={line ?? t('bite.thinking')}
      accessibilityLiveRegion="polite"
    >
      <BiteAvatar size={32} state="thinking" />
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
  bubble: {
    alignSelf: 'flex-end',
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
  biteText: {
    paddingTop: 5,
  },
  thinking: {
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
