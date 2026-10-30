import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Toast } from '@/components/ui/toast';
import { useNumberFormat } from '@/i18n/units';

import { useUndoEstimate } from './entries';
import { refKey } from './foods';
import { handOverMealPhotos, takeLoggedEstimate, type HandedEstimate } from './meal-photo-handover';
import { MealPhotoSheet } from './meal-photo-sheet';
import type { Meal } from './meals';

type LoggedEstimateOptions = {
  meal: Meal;
  /** YYYY-MM-DD. */
  day: string;
  /** Called with the foods a meal logged from photos added, by their `refKey`. */
  onAdded: (keys: string[]) => void;
  /** Called with the same foods once Undo took them back. */
  onUndone: (keys: string[]) => void;
};

/**
 * Logging a meal from photos from the add screen (#299): the sheet that takes or chooses the
 * photos and opens the photo screen with them, and, once that screen logged the meal, the toast
 * that says so and offers to undo it (ADR 0060).
 */
export function useLoggedEstimate({ meal, day, onAdded, onUndone }: LoggedEstimateOptions): {
  openSheet: () => void;
  sheet: ReactNode;
  toast: ReactNode;
  undoFailed: boolean;
} {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const undoEstimate = useUndoEstimate();
  const [picking, setPicking] = useState(false);
  // The meal logged last from photos, which the toast offers to undo.
  const [logged, setLogged] = useState<HandedEstimate | null>(null);

  // A meal logged on the photo screen comes back here, its foods shown as added.
  useFocusEffect(
    useCallback(() => {
      const estimate = takeLoggedEstimate(meal, day);
      if (estimate) {
        setLogged(estimate);
        onAdded(estimate.foods.map(refKey));
      }
    }, [meal, day, onAdded]),
  );
  const hideToast = useCallback(() => setLogged(null), []);

  const undo = (estimate: HandedEstimate) =>
    undoEstimate.mutate(estimate, { onSuccess: () => onUndone(estimate.foods.map(refKey)) });

  return {
    openSheet: () => setPicking(true),
    sheet: picking ? (
      <MealPhotoSheet
        onPick={(photos) =>
          router.push({
            pathname: '/nutrition/photo',
            params: { meal, day, photos: handOverMealPhotos(photos) },
          })
        }
        onClose={() => setPicking(false)}
      />
    ) : null,
    toast: logged ? (
      <Toast
        // A new toast for each meal, so that its time and announcement start again.
        key={logged.entryIds.join()}
        message={t('nutrition.photo.added', {
          count: logged.entryIds.length,
          calories: format(Math.round(logged.calories)),
        })}
        action={{ label: t('nutrition.meal.undo'), onPress: () => undo(logged) }}
        onHide={hideToast}
      />
    ) : null,
    undoFailed: undoEstimate.isError,
  };
}
