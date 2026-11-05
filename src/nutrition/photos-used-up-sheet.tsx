import { useTranslation } from 'react-i18next';

import { isoWeekday, useWeekdayFormat } from '@/i18n/dates';
import { PremiumOfferSheet } from '@/premium/premium-offer-sheet';

type PhotosUsedUpSheetProps = {
  /** When new ones come. */
  resetsAt?: Date;
  onClose: () => void;
};

/** The week's meal photos on the free plan are used up (#411): when new ones come, and premium. */
export function PhotosUsedUpSheet({ resetsAt, onClose }: PhotosUsedUpSheetProps) {
  const { t } = useTranslation();
  const weekday = useWeekdayFormat('long');
  return (
    <PremiumOfferSheet
      expression="sad"
      title={t('nutrition.photo.usedUp.title')}
      body={
        resetsAt
          ? t('nutrition.photo.usedUp.body', { day: weekday(isoWeekday(resetsAt)) })
          : t('nutrition.photo.usedUp.bodyNoDay')
      }
      onClose={onClose}
    />
  );
}
