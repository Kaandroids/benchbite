import { useTranslation } from 'react-i18next';

import { BiteSheet } from '@/coach/bite-sheet';
import { Button } from '@/components/ui/button';
import { closeThen } from '@/components/ui/sheet';
import { useOpenPremium } from '@/premium/open-premium';

/** Moving a workout to the archive on a plan without it (ADR 0082): what it is, and premium. */
export function ArchiveSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const openPremium = useOpenPremium();
  return (
    <BiteSheet
      title={t('workout.archive.sheetTitle')}
      body={t('workout.archive.sheetBody')}
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
