import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { afterSheetCloses } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useOpenPremium } from '@/premium/open-premium';
import { useTheme } from '@/theme';

import { useConfirmDeleteWorkout } from './confirm-delete';
import { useWorkoutName } from './format';
import { WaitingSheet } from './waiting-sheet';
import { useCurrentWorkoutLimits, type Workout } from './workouts';

/** Closes the sheet, then runs `action`, as iOS shows no alert or screen over a closing sheet. */
function thenClose(onClose: () => void, action: () => void) {
  return () => {
    onClose();
    afterSheetCloses(action);
  };
}

type HeldWorkoutSheetProps = {
  workout: Workout;
  onClose: () => void;
};

/**
 * A workout that waits for premium, tapped in a list: that it is kept as it was, with premium to
 * get it back, its exercises to look at and a delete to make room.
 */
export function HeldWorkoutSheet({ workout, onClose }: HeldWorkoutSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const limits = useCurrentWorkoutLimits();
  const openPremium = useOpenPremium();
  const { confirm: confirmDelete } = useConfirmDeleteWorkout();
  const name = useWorkoutName()(workout);

  return (
    <WaitingSheet
      title={t('workout.held.sheetTitle', { name })}
      body={
        limits ? t('workout.held.sheetBody', { count: limits.workouts }) : t('workout.held.kept')
      }
      onClose={onClose}
    >
      <Button label={t('workout.held.getBack')} onPress={thenClose(onClose, openPremium)} />
      <Button
        label={t('workout.held.seeExercises')}
        variant="secondary"
        onPress={thenClose(onClose, () =>
          router.push({ pathname: '/workout/[id]', params: { id: String(workout.id) } }),
        )}
      />
      {/* Quiet and close under the buttons, as a way out rather than an offer. */}
      <Pressable
        accessibilityRole="button"
        onPress={thenClose(onClose, () => confirmDelete(workout.id))}
        style={[styles.delete, { marginTop: -spacing.sm }]}
      >
        <Text variant="bodyStrong" color="danger" style={styles.quiet}>
          {t('workout.held.deleteToMakeRoom')}
        </Text>
      </Pressable>
    </WaitingSheet>
  );
}

type HeldAlternativeSheetProps = {
  /** The alternative's name, as its chip shows it. */
  name: string;
  /** Opens the workout's alternatives, where it can be deleted or another put in use. */
  onManage: () => void;
  onClose: () => void;
};

/**
 * An alternative that waits for premium, tapped among a workout's chips: that it is kept, with
 * premium to get it back and the alternatives to make room.
 */
export function HeldAlternativeSheet({ name, onManage, onClose }: HeldAlternativeSheetProps) {
  const { t } = useTranslation();
  const limits = useCurrentWorkoutLimits();
  const openPremium = useOpenPremium();
  // Null on plans without a limit in all.
  const inAll = limits?.added_alternatives;

  return (
    <WaitingSheet
      title={t('workout.held.sheetTitle', { name })}
      body={
        inAll != null ? t('workout.held.alternativeBody', { count: inAll }) : t('workout.held.kept')
      }
      onClose={onClose}
    >
      <Button label={t('workout.held.getBack')} onPress={thenClose(onClose, openPremium)} />
      <Button
        label={t('workout.held.manageAlternatives')}
        variant="secondary"
        onPress={thenClose(onClose, onManage)}
      />
    </WaitingSheet>
  );
}

const styles = StyleSheet.create({
  delete: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quiet: {
    opacity: 0.7,
  },
});
