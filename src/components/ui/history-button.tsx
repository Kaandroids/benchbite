import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';

type HistoryButtonProps = {
  exerciseId: string;
  exerciseName: string;
};

/** A small grey chart that opens an exercise's records and progress. */
export function HistoryButton({ exerciseId, exerciseName }: HistoryButtonProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('exercise.history', { name: exerciseName })}
      onPress={() =>
        router.push({ pathname: '/workout/exercise/history', params: { id: exerciseId } })
      }
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.track, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name="trend" size={16} color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
