import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useUpperCase } from '@/i18n/case';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import type { ThreadSummary } from './threads';
import { useMomentFormat } from './use-moment-format';

export type ContinueWith = {
  /** The last chat, no longer recent. */
  thread: ThreadSummary;
  onContinue: (thread: number) => void;
  onAllChats: () => void;
};

/** The last chat to go on with, as a new chat offers it (board 13), and a way to all chats. */
export function ContinueCard({ thread, onContinue, onAllChats }: ContinueWith) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const upper = useUpperCase();
  const moment = useMomentFormat();
  const title = thread.title ?? t('bite.chats.untitled');
  const time = moment(thread.lastMessageAt);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="captionStrong" color="textMuted" style={{ paddingLeft: spacing.xs }}>
        {upper(t('bite.continue'))}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${time}`}
        onPress={() => onContinue(thread.id)}
        style={({ pressed }) => [
          styles.card,
          {
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radii.lg,
            borderColor: colors.border,
            backgroundColor: pressed ? colors.track : colors.surface,
          },
        ]}
      >
        <BiteAvatar size={40} expression={thread.expression ?? 'neutral'} />
        <View style={styles.text}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" color="textMuted">
            {time}
          </Text>
        </View>
        <Icon name="forward" color="textMuted" size={20} />
      </Pressable>
      <View style={styles.center}>
        <TextLink label={t('bite.allChats')} onPress={onAllChats} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  center: {
    alignItems: 'center',
  },
});
