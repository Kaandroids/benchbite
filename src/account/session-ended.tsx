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
  const asGuest = (label: string, variant: 'primary' | 'secondary') => (
    <Button variant={variant} label={label} loading={starting} onPress={() => void startAgain()} />
  );

  return (
    <Screen
      footer={
        <View style={{ gap: spacing.md }}>
          {reason === 'guest' ? (
            <>
              {asGuest(t('sessionEnded.startAgain'), 'primary')}
              <Button
                variant="secondary"
                label={t('settings.createAccount')}
                onPress={() => setForm('create')}
              />
              <LinkPrompt
                question={t('account.haveAccount')}
                action={t('account.logIn')}
                onPress={() => setForm('logIn')}
              />
              <Text variant="caption" color="textMuted" align="center">
                {t('sessionEnded.accountNote')}
              </Text>
            </>
          ) : reason === 'account' ? (
            <>
              <Button label={t('account.logIn')} onPress={() => setForm('logIn')} />
              {asGuest(t('sessionEnded.continueAsGuest'), 'secondary')}
              <Text variant="caption" color="textMuted" align="center">
                {t('sessionEnded.signedOut.guestNote')}
              </Text>
            </>
          ) : (
            <>
              {asGuest(t('sessionEnded.continueAsGuest'), 'primary')}
              <Button
                variant="secondary"
                label={t('settings.createAccount')}
                onPress={() => setForm('create')}
              />
            </>
          )}
        </View>
      }
    >
      <MessageView
        icon={ICONS[reason]}
        tone="danger"
        title={t(`sessionEnded.${COPY[reason]}.title`)}
        message={t(`sessionEnded.${COPY[reason]}.message`)}
      />
    </Screen>
  );
}

const ICONS = { guest: 'personOff', account: 'logOut', deleted: 'trash' } as const;

/** The copy of each reason, under `sessionEnded`. */
const COPY = { guest: 'guest', account: 'signedOut', deleted: 'deleted' } as const;
