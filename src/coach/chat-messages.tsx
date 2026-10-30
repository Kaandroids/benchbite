import { Fragment, memo, useEffect } from 'react';
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
import { sameDay } from '@/i18n/dates';
import { oneOf } from '@/lib/one-of';
import { radii, useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import type { ChatMessage, ChatStatus } from './use-chat';
import { useMomentFormat } from './use-moment-format';

/** Bite's face beside its messages. */
const AVATAR = 32;
type Spacing = ReturnType<typeof useTheme>['spacing'];
/** The room between Bite's face and its message. */
const avatarGap = (spacing: Spacing) => spacing.md - 2;
/** Where Bite's messages begin, past its face, as what goes under them does. */
const pastAvatar = (spacing: Spacing) => AVATAR + avatarGap(spacing);

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
  const moment = useMomentFormat();
  // A conversation over more than one day shows when each day of it began (board 18).
  const first = messages[0]?.createdAt;
  const days =
    first !== undefined && messages.some((m) => m.createdAt && !sameDay(m.createdAt, first));
  return (
    <View style={{ gap: spacing.lg }}>
      {messages.map((message, index) => {
        const before = messages[index - 1]?.createdAt;
        const startsDay =
          days &&
          message.createdAt !== undefined &&
          (!before || !sameDay(before, message.createdAt));
        return (
          <Fragment key={message.id}>
            {startsDay ? (
              <Text variant="caption" color="textMuted" align="center" accessibilityRole="header">
                {moment(message.createdAt!)}
              </Text>
            ) : null}
            <MessageRow
              message={message}
              last={index === messages.length - 1}
              status={status}
              tool={tool}
              onAskAgain={onAskAgain}
            />
          </Fragment>
        );
      })}
      {/* A lookup after Bite started writing shows under what it wrote. */}
      {status === 'answering' && tool ? <ToolLine tool={tool} indent /> : null}
    </View>
  );
}

type MessageRowProps = Pick<ChatMessagesProps, 'status' | 'tool' | 'onAskAgain'> & {
  message: ChatMessage;
  last: boolean;
};

/** A message: the user's, Bite's, or Bite's last one thinking while it waits. */
function MessageRow({ message, last, status, tool, onAskAgain }: MessageRowProps) {
  if (message.role === 'user') {
    return <UserMessage message={message} onAskAgain={onAskAgain} />;
  }
  if (last && status === 'thinking' && !message.text) {
    return <Thinking tool={tool} />;
  }
  return <BiteMessage message={message} talking={last && status !== 'idle'} />;
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
      <View style={[styles.bite, { gap: avatarGap(spacing) }]}>
        {talking ? (
          <BiteAvatar size={AVATAR} expression={expression} state="talking" />
        ) : (
          <BiteAvatar size={AVATAR} expression={expression} />
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
        <Text variant="caption" color="textMuted" style={{ marginLeft: pastAvatar(spacing) }}>
          {t(message.cut === 'stopped' ? 'bite.stopped' : 'bite.cutOff')}
        </Text>
      ) : null}
    </View>
  );
});

function Thinking({ tool }: { tool?: string }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: avatarGap(spacing) }]}>
      <BiteAvatar size={AVATAR} state="thinking" />
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
      style={[
        styles.row,
        styles.flex,
        { gap: avatarGap(spacing), marginLeft: indent ? pastAvatar(spacing) : 0 },
      ]}
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

/** The sharper corner of a message, toward who said it. */
const TAIL = 6;

const styles = StyleSheet.create({
  user: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: TAIL,
  },
  bite: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  /** Bite's answer on a card, its corner by Bite's face sharper, as the user's is by its edge. */
  biteBubble: {
    flexShrink: 1,
    borderWidth: 1,
    borderTopLeftRadius: TAIL,
    borderTopRightRadius: radii.xl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
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
