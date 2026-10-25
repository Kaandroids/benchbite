import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { CreateAccountScreen } from '@/account/create-account-screen';
import { LogInScreen } from '@/account/log-in-screen';
import { Button } from '@/components/ui/button';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type SessionEndedProps = {
  onStartAgain: () => Promise<void>;
};

/**
 * Shown when the session of the user who used this device ended, so their data can no longer be
 * opened: says so, and starts over as a new guest. Someone with an account logs in to it again;
 * the app has no screens to navigate to here, so the account forms open in place.
 */
export function SessionEnded({ onStartAgain }: SessionEndedProps) {
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
          <Button
            label={t('sessionEnded.startAgain')}
            loading={starting}
            onPress={() => void startAgain()}
          />
          <Button
            variant="secondary"
            label={t('sessionEnded.createAccount')}
            onPress={() => setForm('create')}
          />
          <View style={styles.login}>
            <Text color="textMuted">{t('sessionEnded.haveAccount')} </Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setForm('logIn')}>
              <Text variant="label" color="primaryText">
                {t('sessionEnded.logIn')}
              </Text>
            </Pressable>
          </View>
          <Text variant="caption" color="textMuted" align="center">
            {t('sessionEnded.accountNote')}
          </Text>
        </View>
      }
    >
      <MessageView
        icon="personOff"
        title={t('sessionEnded.title')}
        message={t('sessionEnded.message')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  login: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
