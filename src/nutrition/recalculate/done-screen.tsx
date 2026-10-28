import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { SuccessBadge } from '@/components/ui/success-badge';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { useNutritionTargets } from '../targets';
import { targetsFromWas } from './answers';
import { Comparison } from './comparison';

/** The page after saving: the new goals against the ones in use before. */
export function DoneScreen({ was }: { was: string | undefined }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const inUse = useNutritionTargets();
  const from = targetsFromWas(was);
  const to = inUse.data;

  return (
    <Screen
      footer={
        // Back to the day, which is measured against the new goals from now on.
        <Button
          label={t('nutrition.recalculate.done.done')}
          onPress={() => router.dismissTo('/nutrition')}
        />
      }
    >
      <View style={[styles.center, { gap: spacing.sm }]}>
        <SuccessBadge />
        <Text variant="title" align="center" accessibilityRole="header">
          {t('nutrition.recalculate.done.title')}
        </Text>
        <Text color="textMuted" align="center">
          {t('nutrition.recalculate.done.intro')}
        </Text>
      </View>
      {to ? (
        <>
          <Comparison from={from ?? to} to={to} />
          <Text color="textMuted">{t('nutrition.recalculate.done.note')}</Text>
        </>
      ) : (
        <LoadState queries={[inUse]} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
});
