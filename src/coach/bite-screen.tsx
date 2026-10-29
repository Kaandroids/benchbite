import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';

/** The chat with Bite, opened from the middle of the tab bar; the chat itself comes with #294. */
export function BiteScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Screen onBack={() => router.back()} title={t('bite.title')}>
      <View style={[styles.center, { gap: spacing.lg }]}>
        <BiteAvatar size={120} />
        <Text color="textMuted" align="center">
          {t('bite.soon')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
