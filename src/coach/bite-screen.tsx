import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { BRAND_ORANGE } from '@/brand/mark';
import { useTheme } from '@/theme';

import { BiteFace } from './bite-face';

const SIZE = 120;

/** The chat with Bite, opened from the middle of the tab bar; the chat itself comes with #294. */
export function BiteScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Screen onBack={() => router.back()} title={t('bite.title')}>
      <View style={[styles.center, { gap: spacing.lg }]}>
        <View style={[styles.face, { backgroundColor: BRAND_ORANGE }]}>
          <BiteFace size={SIZE - 20} />
        </View>
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
  face: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
