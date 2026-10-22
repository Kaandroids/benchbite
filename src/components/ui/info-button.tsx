import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';

type InfoButtonProps = {
  exerciseId: string;
  exerciseName: string;
  /** Called before the details open, for example to close a sheet. */
  onOpen?: () => void;
};

/** A small blue "i" that opens how to do an exercise. */
export function InfoButton({ exerciseId, exerciseName, onOpen }: InfoButtonProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('exercise.details', { name: exerciseName })}
      onPress={() => {
        onOpen?.();
        router.push({ pathname: '/workout/exercise/[id]', params: { id: exerciseId } });
      }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.infoBackground, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name="info" size={16} color="info" />
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
