import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type SessionEndedProps = {
  onStartAgain: () => Promise<void>;
};

/**
 * Shown when the session of the guest who used this device ended, so their data can no longer be
 * opened: says so, and starts over as a new guest. Creating an account and logging in, which
 * would keep the data, have no screens yet (#130).
 */
export function SessionEnded({ onStartAgain }: SessionEndedProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [starting, setStarting] = useState(false);

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
          {/* No accounts yet (#130). */}
          <Button variant="secondary" label={t('sessionEnded.createAccount')} onPress={() => {}} />
          <View style={styles.login}>
            <Text color="textMuted">{t('sessionEnded.haveAccount')} </Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => {}}>
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
