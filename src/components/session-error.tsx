import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type SessionErrorProps = {
  onRetry: () => Promise<void>;
};

/** Shown when the first anonymous sign-in fails, usually because the device is offline. */
export function SessionError({ onRetry }: SessionErrorProps) {
  const { spacing } = useTheme();
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
      <View style={[styles.content, { gap: spacing.md }]}>
        <View style={{ marginBottom: spacing.sm }}>
          <IconTile name="offline" size={80} />
        </View>
        <Text variant="title" align="center">
          {t('sessionError.title')}
        </Text>
        <Text color="textMuted" align="center">
          {t('sessionError.message')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
