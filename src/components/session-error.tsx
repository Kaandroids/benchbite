import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';

type SessionErrorProps = {
  onRetry: () => Promise<void>;
};

/** Shown when the first anonymous sign-in fails, usually because the device is offline. */
export function SessionError({ onRetry }: SessionErrorProps) {
  const { t } = useTranslation();
  const [isRetrying, setIsRetrying] = useState(false);

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <Screen
      footer={<Button label={t('common.tryAgain')} loading={isRetrying} onPress={handleRetry} />}
    >
      <MessageView
        icon="offline"
        title={t('sessionError.title')}
        message={t('sessionError.message')}
      />
    </Screen>
  );
}
