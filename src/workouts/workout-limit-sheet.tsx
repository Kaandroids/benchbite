import { useTranslation } from 'react-i18next';

import { PremiumOfferSheet } from './premium-offer-sheet';

type WorkoutLimitSheetProps = {
  /** How many workouts count toward the limit. */
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
  return (
    <PremiumOfferSheet
      // More than the plan has room for when some wait for premium.
      title={count === max ? t('workout.limitSheet.title', { count }) : t('workout.limitTitle')}
      body={t('workout.limitSheet.body', {
        count: premium.workouts,
        versions: premium.versions,
      })}
      onClose={onClose}
    />
  );
}
