import type { ReactNode } from 'react';
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

import { HEALTH_READS, type HealthRead } from './connection';
import { READ_LOOKS } from './reads';
import type { HealthStore } from './types';

/** What the user is asked to allow, as the consent sheet lists it. */
const CONSENT_ROWS: {
  key: 'heartRate' | 'calories' | HealthRead;
  icon: IconName;
  color: keyof ColorTokens;
  background: keyof ColorTokens;
}[] = [
  { key: 'heartRate', icon: 'heart', color: 'snack', background: 'snackBackground' },
  { key: 'calories', icon: 'flame', color: 'lunch', background: 'lunchBackground' },
  ...HEALTH_READS.map((key) => {
    const { icon, color, background } = READ_LOOKS[key];
    return { key, icon, color, background };
  }),
];

/** What saving workouts writes, and what it leaves out, as the write sheet lists it. */
const WRITE_ROWS: { key: 'workout' | 'fromNow' | 'notTwice'; icon: IconName; good: boolean }[] = [
  { key: 'workout', icon: 'check', good: true },
  { key: 'fromNow', icon: 'check', good: true },
  { key: 'notTwice', icon: 'close', good: false },
];

type SheetProps = {
  store: NonNullable<HealthStore>;
  busy: boolean;
  onClose: () => void;
};

/**
 * The frame of a sheet before the system asks: what it is about, then Continue, Not now and what
 * the system asks next.
 */
function AskSheet({
  title,
  body,
  next,
  busy,
  onContinue,
  onClose,
  children,
}: {
  title: string;
  body: string;
  next: string;
  busy: boolean;
  onContinue: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <BiteSheet title={title} body={body} onClose={onClose}>
      {children}
      <Button label={t('health.consent.continue')} loading={busy} onPress={onContinue} />
      <Button
        label={t('health.consent.notNow')}
        variant="secondary"
        disabled={busy}
        onPress={onClose}
      />
      <Text variant="caption" color="textMuted" align="center">
        {next}
      </Text>
    </BiteSheet>
  );
}

/** Says what is read and kept, and when anything is written, before the system asks. */
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
    <AskSheet
      title={t('health.consent.title', { store: name })}
      body={t('health.consent.body')}
      next={t(`health.consent.next.${store}`)}
      busy={busy}
      onContinue={onConnect}
      onClose={onClose}
    >
      <Card list>
        {CONSENT_ROWS.map(({ key, icon, color, background }, index) => (
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
    </AskSheet>
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

/** What saving workouts writes to the store, before the system asks (ADR 0105). */
export function WriteSheet({
  store,
  busy,
  onAllow,
  onClose,
}: SheetProps & { onAllow: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const name = t(`health.${store}`);
  return (
    <AskSheet
      title={t('health.write.title', { store: name })}
      body={t(`health.write.body.${store}`)}
      next={t(`health.write.next.${store}`)}
      busy={busy}
      onContinue={onAllow}
      onClose={onClose}
    >
      <Card list>
        <Text variant="caption" color="textMuted" style={{ paddingVertical: spacing.sm }}>
          {t('health.write.writes')}
        </Text>
        {WRITE_ROWS.map(({ key, icon, good }) => (
          <View
            key={key}
            style={[
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.sm },
              listDivider(false, colors.border),
            ]}
          >
            <Icon name={icon} size={18} color={good ? 'success' : 'textMuted'} />
            <Text color={good ? 'text' : 'textMuted'} style={styles.flex}>
              {t(`health.write.${key}`)}
            </Text>
          </View>
        ))}
      </Card>
    </AskSheet>
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
