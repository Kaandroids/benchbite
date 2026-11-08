import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BiteSheet } from '@/coach/bite-sheet';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { DashedButton } from '@/components/ui/dashed-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Sheet, SheetTitle } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme, type ColorTokens } from '@/theme';

import type { HealthStore } from './types';

/** What the user is asked to allow, as the consent sheet lists it. */
const READS: {
  key: 'heartRate' | 'calories' | 'weight';
  icon: IconName;
  color: keyof ColorTokens;
  background: keyof ColorTokens;
}[] = [
  { key: 'heartRate', icon: 'heart', color: 'snack', background: 'snackBackground' },
  { key: 'calories', icon: 'flame', color: 'lunch', background: 'lunchBackground' },
  { key: 'weight', icon: 'scale', color: 'water', background: 'waterBackground' },
];

type SheetProps = {
  store: NonNullable<HealthStore>;
  busy: boolean;
  onClose: () => void;
};

/** Says what is read and kept, and that nothing is written, before the system asks. */
export function ConsentSheet({
  store,
  busy,
  onConnect,
  onClose,
}: SheetProps & { onConnect: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const name = t(`health.${store}`);
  return (
    <BiteSheet
      title={t('health.consent.title', { store: name })}
      body={t('health.consent.body')}
      onClose={onClose}
    >
      <Card list>
        {READS.map(({ key, icon, color, background }, index) => (
          <View
            key={key}
            style={[
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.sm },
              listDivider(index === 0, colors.border),
            ]}
          >
            <IconTile name={icon} size={36} color={color} background={background} />
            <View style={styles.flex}>
              <Text variant="label">{t(`health.consent.${key}`)}</Text>
              <Text variant="caption" color="textMuted">
                {t(`health.consent.${key}When`)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      <Text color="textMuted">{t('health.consent.keeps', { store: name })}</Text>
      <Button label={t('health.consent.continue')} loading={busy} onPress={onConnect} />
      <Button
        label={t('health.consent.notNow')}
        variant="secondary"
        disabled={busy}
        onPress={onClose}
      />
      <Text variant="caption" color="textMuted" align="center">
        {t(`health.consent.next.${store}`)}
      </Text>
    </BiteSheet>
  );
}

/** Keeps the connection as the main way out; disconnecting is set apart. */
export function DisconnectSheet({
  store,
  busy,
  onDisconnect,
  onClose,
}: SheetProps & { onDisconnect: () => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const name = t(`health.${store}`);
  return (
    <Sheet onClose={onClose}>
      <SheetTitle>{name}</SheetTitle>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Icon name="check" size={18} color="success" />
        <Text variant="label">{t('health.connected')}</Text>
      </View>
      <Text color="textMuted">{t('health.disconnect.body', { store: name })}</Text>
      <Button label={t('health.disconnect.keep')} disabled={busy} onPress={onClose} />
      <DashedButton
        icon="close"
        label={t('health.disconnect.confirm')}
        tone="danger"
        onPress={onDisconnect}
      />
    </Sheet>
  );
}

/** Points to Google Play for Health Connect, which Android 9 to 13 have as an app of its own. */
export function InstallSheet({
  onInstall,
  onClose,
}: {
  onInstall: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <BiteSheet
      title={t('health.install.title')}
      body={t('health.install.body')}
      expression="sad"
      onClose={onClose}
    >
      <Button label={t('health.install.open')} onPress={onInstall} />
      <Button label={t('health.consent.notNow')} variant="secondary" onPress={onClose} />
      <Text variant="caption" color="textMuted" align="center">
        {t('health.install.builtIn')}
      </Text>
    </BiteSheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
