import { useTranslation } from 'react-i18next';

import { BiteSheet } from '@/coach/bite-sheet';
import { Button } from '@/components/ui/button';
import { closeThen } from '@/components/ui/sheet';
import { useOpenPremium } from '@/premium/open-premium';

type PremiumOfferSheetProps = {
  title: string;
  body: string;
  onClose: () => void;
};

/** What a plan stops the user from doing, with a way to premium or back to what they were doing. */
export function PremiumOfferSheet({ title, body, onClose }: PremiumOfferSheetProps) {
  const { t } = useTranslation();
  const openPremium = useOpenPremium();
  return (
    <BiteSheet title={title} body={body} onClose={onClose}>
      <Button
        label={t('workout.premiumOffer.seePremium')}
        onPress={closeThen(onClose, openPremium)}
      />
      <Button label={t('workout.premiumOffer.notNow')} variant="secondary" onPress={onClose} />
    </BiteSheet>
  );
}
