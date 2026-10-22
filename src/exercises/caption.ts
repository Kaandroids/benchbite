import { useTranslation } from 'react-i18next';

import type { LibraryExercise } from './library';

/** Describes an exercise by its main muscle and its equipment, such as "Chest · Barbell". */
export function useExerciseCaption() {
  const { t } = useTranslation();
  return (exercise: Pick<LibraryExercise, 'primaryMuscles' | 'equipment'>) =>
    [
      exercise.primaryMuscles[0] ? t(`workout.muscles.${exercise.primaryMuscles[0]}`) : null,
      exercise.equipment ? t(`exercise.equipmentKinds.${exercise.equipment}`) : null,
    ]
      .filter(Boolean)
      .join(' · ');
}
