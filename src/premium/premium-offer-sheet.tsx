import { useTranslation } from 'react-i18next';

import type { BiteExpression } from '@/coach/bite-expressions';
import { BiteSheet } from '@/coach/bite-sheet';
import { Button } from '@/components/ui/button';
import { closeThen } from '@/components/ui/sheet';

import { useOpenPremium } from './open-premium';

type PremiumOfferSheetProps = {
  title: string;
  body: string;
  /** Bite's face, as when the news is not good. */
  expression?: BiteExpression;
  onClose: () => void;
};

/** What a plan stops the user from doing, with a way to premium or back to what they were doing. */
export function PremiumOfferSheet({ title, body, expression, onClose }: PremiumOfferSheetProps) {
  const { t } = useTranslation();
  const openPremium = useOpenPremium();
  return (
    <BiteSheet title={title} body={body} expression={expression} onClose={onClose}>
      <Button
        label={t('premium.offerSheet.seePremium')}
        onPress={closeThen(onClose, openPremium)}
      />
      <Button label={t('premium.offerSheet.notNow')} variant="secondary" onPress={onClose} />
    </BiteSheet>
  );
}
