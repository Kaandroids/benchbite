import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { BiteAvatar } from '@/coach/bite-avatar';
import { Button } from '@/components/ui/button';
import { afterSheetCloses, Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useOpenPremium } from '@/premium/open-premium';
import { useTheme } from '@/theme';

import { useConfirmDeleteWorkout } from './confirm-delete';
import { useWorkoutName } from './format';
import { useWorkoutLimits, type Workout } from './workouts';

const BITE_SIZE = 64;
/** How far Bite stands above the sheet's top edge, the rest of it over the sheet's corner. */
const BITE_PEEK = 44;

type HeldWorkoutSheetProps = {
  workout: Workout;
  onClose: () => void;
};

/**
 * A workout that waits for premium, tapped in a list: that it is kept as it was, with premium to
 * get it back, its exercises to look at and a delete to make room. Bite looks over the sheet.
 */
export function HeldWorkoutSheet({ workout, onClose }: HeldWorkoutSheetProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const limits = useWorkoutLimits();
  const openPremium = useOpenPremium();
  const { confirm: confirmDelete } = useConfirmDeleteWorkout();
  const name = useWorkoutName()(workout);

  // Once the sheet has closed, as iOS shows no alert or screen over a closing sheet.
  const thenClose = (action: () => void) => () => {
    onClose();
    afterSheetCloses(action);
  };

  return (
    <Sheet onClose={onClose}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.bite,
          {
            top: -BITE_PEEK,
            right: spacing.xl,
            borderRadius: BITE_SIZE,
            borderColor: colors.background,
          },
        ]}
      >
        <BiteAvatar size={BITE_SIZE} looksAbout />
      </View>
      <View style={{ gap: spacing.xs, paddingRight: BITE_SIZE + spacing.md }}>
        <Text variant="headline" accessibilityRole="header">
          {t('workout.held.sheetTitle', { name })}
        </Text>
        <Text color="textMuted">
          {limits.data
            ? t('workout.held.sheetBody', { count: limits.data.workouts })
            : t('workout.held.kept')}
        </Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Button label={t('workout.held.getBack')} onPress={thenClose(openPremium)} />
        <Button
          label={t('workout.held.seeExercises')}
          variant="secondary"
          onPress={thenClose(() =>
            router.push({ pathname: '/workout/[id]', params: { id: String(workout.id) } }),
          )}
        />
        <Pressable
          accessibilityRole="button"
          onPress={thenClose(() => confirmDelete(workout.id))}
          style={styles.delete}
        >
          <Text variant="label" color="danger">
            {t('workout.held.deleteToMakeRoom')}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bite: {
    position: 'absolute',
    borderWidth: 4,
  },
  delete: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
