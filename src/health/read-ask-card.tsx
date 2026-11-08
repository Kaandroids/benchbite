import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, type CardProps } from '@/components/ui/card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { useTheme, type ColorTokens } from '@/theme';

import { useStoreName } from './use-store-name';
import type { HealthRead } from './connection';
import type { useReadAsk } from './use-read-ask';

/** Each kind's icon, on its tile. */
const LOOKS: Record<
  HealthRead,
  { icon: IconName; color: keyof ColorTokens; background: keyof ColorTokens }
> = {
  weight: { icon: 'heart', color: 'snack', background: 'snackBackground' },
  steps: { icon: 'steps', color: 'info', background: 'infoBackground' },
};

/**
 * Asks once whether to read a kind from the health store, for a user who connected it before the
 * kind was read (ADR 0100, 0103); it hides once they answer. The screen holds the asking, to place
 * the cards below it.
 */
export function ReadAskCard({
  ask: { kind, asking, busy, bringIn, notNow },
  entering,
}: {
  ask: ReturnType<typeof useReadAsk>;
  entering?: CardProps['entering'];
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const storeName = useStoreName();
  if (!asking) return null;

  return (
    <Card entering={entering}>
      <View style={[styles.row, { gap: spacing.md, paddingRight: spacing.xl }]}>
        <IconTile
          name={LOOKS[kind].icon}
          size={40}
          color={LOOKS[kind].color}
          background={LOOKS[kind].background}
        />
        <Text variant="headline" style={styles.flex}>
          {t(`health.ask.${kind}.title`, { store: storeName })}
        </Text>
      </View>
      <View style={styles.close}>
        <RoundIconButton
          icon="close"
          color="textMuted"
          background="surface"
          label={t('health.ask.notNow')}
          disabled={busy}
          onPress={notNow}
        />
      </View>
      <Text color="textMuted">{t(`health.ask.${kind}.body`)}</Text>
      <Button label={t(`health.ask.${kind}.bringIn`)} loading={busy} onPress={bringIn} />
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
