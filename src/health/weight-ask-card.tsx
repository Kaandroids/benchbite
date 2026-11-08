import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, type CardProps } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { setWeightReading, useHealthConnected, useWeightReading } from './connection';
import { healthStore, requestHealthWeightAccess } from './health';
import { importHealthWeights } from './weight-import';

/**
 * Asks once whether to take weight from the health store, for a user who connected it before
 * weight was read (#22, ADR 0100); it hides once they answer.
 */
export function WeightAskCard({ entering }: { entering?: CardProps['entering'] }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const connected = useHealthConnected();
  const reading = useWeightReading();
  const [busy, setBusy] = useState(false);
  if (!healthStore || !connected || reading !== null) return null;
  const store = t(`health.${healthStore}`);

  const bringIn = async () => {
    setBusy(true);
    try {
      const allowed = await requestHealthWeightAccess();
      setWeightReading(allowed ? 'on' : 'off');
      if (allowed) await importHealthWeights(queryClient);
    } catch (error) {
      console.warn('Could not bring in the weights from the health store', error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card entering={entering}>
      <View style={[styles.row, { gap: spacing.md, paddingRight: spacing.xl }]}>
        <IconTile name="heart" size={40} color="snack" background="snackBackground" />
        <Text variant="headline" style={styles.flex}>
          {t('health.weightAsk.title', { store })}
        </Text>
      </View>
      <View style={styles.close}>
        <RoundIconButton
          icon="close"
          color="textMuted"
          background="surface"
          label={t('health.weightAsk.notNow')}
          disabled={busy}
          onPress={() => setWeightReading('off')}
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
