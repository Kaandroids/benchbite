import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { listDivider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import type { LoggedEntry } from './meals';
import { usePortionLabel } from './portion-label';

const REMOVE_WIDTH = 96;

type EntryRowProps = {
  entry: LoggedEntry;
  first: boolean;
  onOpen: () => void;
  onRemove: () => void;
};

/**
 * An entry of a meal: its food, amount and calories. Tapping it opens it to change; swiping it left
 * shows Remove, which screen readers offer as an action.
 */
export function EntryRow({ entry, first, onOpen, onRemove }: EntryRowProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const portionLabel = usePortionLabel();
  const grams = t('nutrition.amount.inGrams', { grams: format(entry.grams) });
  const amount = entry.portion
    ? `${portionLabel(entry.portion.unit, entry.portion.count)} · ${grams}`
    : grams;

  return (
    <View style={listDivider(first, colors.border)}>
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={REMOVE_WIDTH / 2}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('nutrition.meal.removeEntry', { name: entry.name })}
            onPress={onRemove}
            style={[styles.remove, { backgroundColor: colors.danger, gap: 2 }]}
          >
            <Icon name="trash" size={20} color="onPrimary" />
            <Text variant="captionStrong" color="onPrimary">
              {t('nutrition.meal.remove')}
            </Text>
          </Pressable>
        )}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityActions={[{ name: 'remove', label: t('nutrition.meal.remove') }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'remove') {
              onRemove();
            }
          }}
          onPress={onOpen}
          style={({ pressed }) => [
            styles.row,
            {
              gap: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              backgroundColor: pressed ? colors.background : colors.surface,
            },
          ]}
        >
          <View style={styles.text}>
            <Text variant="label" numberOfLines={2}>
              {entry.name}
            </Text>
            <Text variant="caption" color="textMuted">
              {amount}
            </Text>
          </View>
          <Text variant="bodyStrong">
            {t('nutrition.kcal', { calories: format(Math.round(entry.calories)) })}
          </Text>
          <Icon name="forward" size={18} color="textMuted" />
        </Pressable>
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
  },
  remove: {
    width: REMOVE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
