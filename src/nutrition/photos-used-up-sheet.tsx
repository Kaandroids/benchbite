import { useTranslation } from 'react-i18next';

import { useComingDayFormat } from '@/i18n/dates';
import { PremiumOfferSheet } from '@/premium/premium-offer-sheet';

type PhotosUsedUpSheetProps = {
  /** When new ones come. */
  until: Date;
  onClose: () => void;
};

/** The week's meal photos on the free plan are used up (#411): when new ones come, and premium. */
export function PhotosUsedUpSheet({ until, onClose }: PhotosUsedUpSheetProps) {
  const { t } = useTranslation();
  const comingDay = useComingDayFormat();
  return (
    <PremiumOfferSheet
      expression="sad"
      title={t('nutrition.photo.usedUp.title')}
      body={t('nutrition.photo.usedUp.body', { day: comingDay(until) })}
      onClose={onClose}
    />
  );
}
