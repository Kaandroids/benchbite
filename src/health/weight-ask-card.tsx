import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, type CardProps } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { useStoreName } from './use-store-name';
import type { useWeightSyncAsk } from './use-weight-sync-ask';

/**
 * Asks once whether to take weight from the health store, for a user who connected it before
 * weight was read (#22, ADR 0100); it hides once they answer. The screen holds the asking, to
 * place the cards below it.
 */
export function WeightAskCard({
  ask: { asking, busy, bringIn, notNow },
  entering,
}: {
  ask: ReturnType<typeof useWeightSyncAsk>;
  entering?: CardProps['entering'];
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const storeName = useStoreName();
  if (!asking) return null;

  return (
    <Card entering={entering}>
      <View style={[styles.row, { gap: spacing.md, paddingRight: spacing.xl }]}>
        <IconTile name="heart" size={40} color="snack" background="snackBackground" />
        <Text variant="headline" style={styles.flex}>
          {t('health.weightAsk.title', { store: storeName })}
        </Text>
      </View>
      <View style={styles.close}>
        <RoundIconButton
          icon="close"
          color="textMuted"
          background="surface"
          label={t('health.weightAsk.notNow')}
          disabled={busy}
          onPress={notNow}
        />
      </View>
      <Text color="textMuted">{t('health.weightAsk.body')}</Text>
      <Button label={t('health.weightAsk.bringIn')} loading={busy} onPress={bringIn} />
    </Card>
  );
}

const styles = StyleSheet.create({
  close: {
    position: 'absolute',
    right: 8,
    top: 8,
  },
  flex: {
    flex: 1,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
