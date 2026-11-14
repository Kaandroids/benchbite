import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { LinkPrompt } from '@/components/ui/link-prompt';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import type { EndedReason } from '@/providers/session-provider';
import { useTheme } from '@/theme';

import { CreateAccountScreen } from './create-account-screen';
import { LogInScreen } from './log-in-screen';

type SessionEndedProps = {
  reason: EndedReason;
  onStartAgain: () => Promise<void>;
};

/**
 * Shown when the session of the user who used this device ended, so their data can no longer be
 * opened, and why: a guest's session was lost, an account was signed out or deleted elsewhere, or
 * the account was found deleted, as on the website. It starts over as a new guest, or the account
 * forms open in place, as the app has no screens to navigate to here.
 */
export function SessionEnded({ reason, onStartAgain }: SessionEndedProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState<'create' | 'logIn' | null>(null);

  // Either form starts a session when it succeeds, and the app leaves this screen.
  if (form === 'create') {
    return <CreateAccountScreen onClose={() => setForm(null)} onLogIn={() => setForm('logIn')} />;
  }
  if (form === 'logIn') {
    return (
      <LogInScreen
        onClose={() => setForm(null)}
        onCreateAccount={() => setForm('create')}
        leavesGuestData={false}
      />
    );
  }

  const startAgain = async () => {
    setStarting(true);
    try {
      await onStartAgain();
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen
      footer={
        <View style={{ gap: spacing.md }}>
          <Footer
            reason={reason}
            starting={starting}
            onStartAgain={() => void startAgain()}
            onOpen={setForm}
          />
        </View>
      }
    >
      <MessageView
        icon={ICONS[reason]}
        tone="danger"
        title={t(`sessionEnded.${reason}.title`)}
        message={t(`sessionEnded.${reason}.message`)}
      />
    </Screen>
  );
}

/** What the user can do once their session ended, as fits why. */
function Footer({
  reason,
  starting,
  onStartAgain,
  onOpen,
}: {
  reason: EndedReason;
  starting: boolean;
  onStartAgain: () => void;
  onOpen: (form: 'create' | 'logIn') => void;
}) {
  const { t } = useTranslation();
  const createAccount = (
    <Button
      variant="secondary"
      label={t('settings.createAccount')}
      onPress={() => onOpen('create')}
    />
  );
  switch (reason) {
    case 'guest':
      return (
        <>
          <Button
            label={t('sessionEnded.guest.startAgain')}
            loading={starting}
            onPress={onStartAgain}
          />
          {createAccount}
          <LinkPrompt
            question={t('account.haveAccount')}
            action={t('account.logIn')}
            onPress={() => onOpen('logIn')}
          />
          <Text variant="caption" color="textMuted" align="center">
            {t('sessionEnded.guest.accountNote')}
          </Text>
        </>
      );
    case 'account':
      return (
        <>
          <Button label={t('account.logIn')} onPress={() => onOpen('logIn')} />
          <Button
            variant="secondary"
            label={t('sessionEnded.continueAsGuest')}
            loading={starting}
            onPress={onStartAgain}
          />
          <Text variant="caption" color="textMuted" align="center">
            {t('sessionEnded.account.guestNote')}
          </Text>
        </>
      );
    case 'deleted':
      return (
        <>
          <Button
            label={t('sessionEnded.continueAsGuest')}
            loading={starting}
            onPress={onStartAgain}
          />
          {createAccount}
        </>
      );
  }
}

const ICONS = { guest: 'personOff', account: 'logOut', deleted: 'trash' } as const;
