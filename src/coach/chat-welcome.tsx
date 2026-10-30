import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useUpperCase } from '@/i18n/case';
import { useDisplayName } from '@/profile/display-name';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import type { ThreadSummary } from './threads';
import { useMomentFormat } from './use-moment-format';

/** What a user may ask Bite first, each with its icon. */
const SUGGESTIONS: { key: 'week' | 'dinner' | 'workout'; icon: IconName }[] = [
  { key: 'week', icon: 'chart' },
  { key: 'dinner', icon: 'meal' },
  { key: 'workout', icon: 'dumbbell' },
];

type ChatWelcomeProps = {
  /** Asks Bite one of the suggestions. */
  onAsk?: (question: string) => void;
  /** The last chat, no longer recent, to go on with (board 13), and all chats. */
  last?: ThreadSummary;
  onContinue?: (thread: number) => void;
  onAllChats?: () => void;
};

/** Bite before the first message: who it is, the last chat to go on with, and what to ask. */
export function ChatWelcome({ onAsk, last, onContinue, onAllChats }: ChatWelcomeProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useTheme();
  const upper = useUpperCase();
  const name = useDisplayName().data;
  const [today] = useState(() => new Date());
  const moment = useMomentFormat(today);
  return (
    <View style={{ gap: spacing.xl }}>
      <View style={[styles.hero, { gap: spacing.md }]}>
        <BiteAvatar size={112} />
        <Text variant="headline" align="center">
          {name ? t('bite.helloName', { name }) : t('bite.hello')}
        </Text>
        <Text color="textMuted" align="center" style={styles.lead}>
          {t('bite.intro')}
        </Text>
      </View>
      {last && onContinue ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="captionStrong" color="textMuted" style={{ paddingLeft: spacing.xs }}>
            {upper(t('bite.continue'))}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onContinue(last.id)}
            style={({ pressed }) => [
              styles.suggestion,
              {
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radii.lg,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.track : colors.surface,
              },
            ]}
          >
            <BiteAvatar size={40} expression={last.expression ?? 'neutral'} />
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {last.title ?? t('bite.chats.untitled')}
              </Text>
              <Text variant="caption" color="textMuted">
                {moment(last.lastMessageAt)}
              </Text>
            </View>
            <Icon name="forward" color="textMuted" size={20} />
          </Pressable>
          {onAllChats ? (
            <View style={styles.hero}>
              <TextLink label={t('bite.allChats')} onPress={onAllChats} />
            </View>
          ) : null}
        </View>
      ) : null}
      {onAsk ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="captionStrong" color="textMuted" style={{ paddingLeft: spacing.xs }}>
            {upper(t('bite.tryAsking'))}
          </Text>
          {SUGGESTIONS.map(({ key, icon }) => {
            const question = t(`bite.suggestions.${key}`);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                onPress={() => onAsk(question)}
                style={({ pressed }) => [
                  styles.suggestion,
                  {
                    gap: spacing.md,
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.lg,
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.track : colors.surface,
                  },
                ]}
              >
                <Icon name={icon} color="primary" size={20} />
                <Text variant="bodyStrong">{question}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
  },
  lead: {
    maxWidth: 300,
  },
  flex: {
    flex: 1,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1,
  },
});
