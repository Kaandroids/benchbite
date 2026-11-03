import { useTranslation } from 'react-i18next';

import { BiteSheet } from '@/coach/bite-sheet';
import { Button } from '@/components/ui/button';
import { TextLink } from '@/components/ui/text-link';

type AccountFirstSheetProps = {
  onCreate: () => void;
  onLogIn: () => void;
  onClose: () => void;
};

/**
 * Before a guest tries premium: an account first, so that the subscription stays theirs on a new
 * phone and can be restored, and what they logged comes along.
 */
export function AccountFirstSheet({ onCreate, onLogIn, onClose }: AccountFirstSheetProps) {
  const { t } = useTranslation();
  return (
    <BiteSheet
      title={t('premium.accountFirst.title')}
      body={t('premium.accountFirst.body')}
      onClose={onClose}
    >
      <Button label={t('premium.accountFirst.create')} onPress={onCreate} />
      <TextLink label={t('premium.accountFirst.logIn')} size="regular" onPress={onLogIn} />
    </BiteSheet>
  );
}
