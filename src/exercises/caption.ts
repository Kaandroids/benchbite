import { useTranslation } from 'react-i18next';

import type { LibraryExercise } from './library';

/**
 * Describes an exercise by its main muscle and its equipment, such as "Chest · Barbell", marked as
 * the user's own when it is: "Mine · Glutes · Machine".
 */
export function useExerciseCaption() {
  const { t } = useTranslation();
  return (exercise: Pick<LibraryExercise, 'primaryMuscles' | 'equipment'> & { custom?: boolean }) =>
    [
      exercise.custom ? t('picker.filters.mine') : null,
      exercise.primaryMuscles[0] ? t(`workout.muscles.${exercise.primaryMuscles[0]}`) : null,
      exercise.equipment ? t(`exercise.equipmentKinds.${exercise.equipment}`) : null,
    ]
      .filter(Boolean)
      .join(' · ');
}
