import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

type GoalsButtonProps = {
  /** The calories eaten on the day shown and its goal; null while they load. */
  calories: { eaten: number; goal: number } | null;
  onPress: () => void;
};

/**
 * Opens the daily goals (ADR 0039), showing the day's calories eaten of its goal, so that the
 * summary below has room for what is left and the macros.
 */
export function GoalsButton({ calories, onPress }: GoalsButtonProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const eaten = calories ? format(Math.round(calories.eaten)) : '';
  const goal = calories ? format(calories.goal) : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        calories ? t('nutrition.goals.eatenOfGoal', { eaten, goal }) : t('nutrition.goals.button')
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          borderRadius: radii.full,
          paddingHorizontal: spacing.md,
          gap: spacing.xs,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Icon name="target" size={16} color="primary" />
      {calories ? (
        <Text variant="label">
          {eaten}
          <Text variant="captionStrong" color="textMuted">
            {' '}
            {t('nutrition.goals.ofGoal', { goal })}
          </Text>
        </Text>
      ) : (
        <Text variant="label">{t('nutrition.goals.button')}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 40,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
