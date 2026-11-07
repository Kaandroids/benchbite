import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BiteAvatar } from '@/coach/bite-avatar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** Says that a new account is ready, after its email address was confirmed. */
export function AccountReadyScreen({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Screen footer={<Button label={t('account.readyContinue')} onPress={onContinue} />}>
      <View style={[styles.content, { gap: spacing.md }]}>
        <BiteAvatar size={160} expression="happy" />
        <Text variant="title" align="center" accessibilityRole="header">
          {t('account.readyTitle')}
        </Text>
        <Text color="textMuted" align="center">
          {t('account.readyMessage')}
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
