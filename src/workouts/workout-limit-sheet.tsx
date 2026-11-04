import { useTranslation } from 'react-i18next';

import { BiteSheet } from '@/coach/bite-sheet';
import { Button } from '@/components/ui/button';
import { closeThen } from '@/components/ui/sheet';
import { useOpenPremium } from '@/premium/open-premium';

type WorkoutLimitSheetProps = {
  /** How many workouts the user has, archived ones included. */
  count: number;
  /** How many their plan has room for. */
  max: number;
  /** The room premium has: workouts, and versions of each. */
  premium: { workouts: number; versions: number };
  onClose: () => void;
};

/**
 * No room for another workout on a plan with less room than premium (#411): how much room premium
 * has, with a way to it, or to delete one instead.
 */
export function WorkoutLimitSheet({ count, max, premium, onClose }: WorkoutLimitSheetProps) {
  const { t } = useTranslation();
  const openPremium = useOpenPremium();
  return (
    <BiteSheet
      // More than the plan has room for when some wait for premium.
      title={count === max ? t('workout.limitSheet.title', { count }) : t('workout.limitTitle')}
      body={t('workout.limitSheet.body', {
        count: premium.workouts,
        versions: premium.versions,
      })}
      onClose={onClose}
    >
      <Button
        label={t('workout.limitSheet.seePremium')}
        onPress={closeThen(onClose, openPremium)}
      />
      <Button label={t('workout.limitSheet.notNow')} variant="secondary" onPress={onClose} />
    </BiteSheet>
  );
}
