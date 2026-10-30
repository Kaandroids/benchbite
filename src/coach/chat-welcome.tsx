import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useUpperCase } from '@/i18n/case';
import { useDisplayName } from '@/profile/display-name';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import { ContinueCard, type ContinueWith } from './continue-card';

/** What a user may ask Bite first, each with its icon. */
const SUGGESTIONS: { key: 'week' | 'dinner' | 'workout'; icon: IconName }[] = [
  { key: 'week', icon: 'chart' },
  { key: 'dinner', icon: 'meal' },
  { key: 'workout', icon: 'dumbbell' },
];

type ChatWelcomeProps = {
  /** Asks Bite one of the suggestions. */
  onAsk?: (question: string) => void;
  /** The last chat, no longer recent, to go on with (board 13). */
  continueWith?: ContinueWith;
};

/** Bite before the first message: who it is, the last chat to go on with, and what to ask. */
export function ChatWelcome({ onAsk, continueWith }: ChatWelcomeProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useTheme();
  const upper = useUpperCase();
  const name = useDisplayName().data;
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
      {continueWith ? <ContinueCard {...continueWith} /> : null}
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
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1,
  },
});
