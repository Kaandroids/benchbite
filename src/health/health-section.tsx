import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { BiteSheet } from '@/coach/bite-sheet';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { DashedButton } from '@/components/ui/dashed-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Sheet, SheetTitle } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useUserId } from '@/providers/session-provider';
import { useTheme, type ColorTokens } from '@/theme';

import { setHealthConnected, useHealthConnected } from './connection';
import {
  healthAvailability,
  healthStore,
  openHealthStore,
  releaseHealthAccess,
  requestHealthAccess,
  type HealthAvailability,
} from './health';

/** What the user is asked to allow, as the consent sheet lists it. */
const READS: {
  key: 'heartRate' | 'calories';
  icon: IconName;
  color: keyof ColorTokens;
  background: keyof ColorTokens;
}[] = [
  { key: 'heartRate', icon: 'heart', color: 'snack', background: 'snackBackground' },
  { key: 'calories', icon: 'flame', color: 'lunch', background: 'lunchBackground' },
];

type Open = 'consent' | 'disconnect' | 'notInstalled' | 'updateRequired' | null;

/**
 * Connects the phone's health store, Apple Health or Health Connect (#467, ADR 0097): a sheet says
 * what is read and kept before the system asks, and another disconnects. Nothing where the phone
 * has no store to read.
 */
export function HealthSection() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const userId = useUserId();
  const connected = useHealthConnected(userId);
  const [open, setOpen] = useState<Open>(null);
  const [problem, setProblem] = useState<'denied' | 'unavailable' | null>(null);
  const [busy, setBusy] = useState(false);

  if (!healthStore) {
    return null;
  }
  const store = t(`health.${healthStore}`);

  const press = async () => {
    setProblem(null);
    if (connected) {
      setOpen('disconnect');
      return;
    }
    const availability = await healthAvailability();
    if (availability === 'unavailable') {
      setProblem('unavailable');
    } else {
      setOpen(availability === 'available' ? 'consent' : availability);
    }
  };

  const connect = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const allowed = await requestHealthAccess();
      setHealthConnected(userId, allowed);
      setProblem(allowed ? null : 'denied');
    } finally {
      setBusy(false);
      setOpen(null);
    }
  };

  const disconnect = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await releaseHealthAccess();
    } finally {
      setHealthConnected(userId, false);
      setBusy(false);
      setOpen(null);
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t('health.rowHint')}
        onPress={() => void press()}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <Card style={[styles.row, { gap: spacing.md }]}>
          <IconTile name="heart" size={40} color="snack" background="snackBackground" />
          <Text variant="label" style={styles.label}>
            {store}
          </Text>
          {connected ? (
            <View style={[styles.row, { gap: spacing.xs }]}>
              <Icon name="check" size={16} color="success" />
              <Text variant="bodyStrong" color="success">
                {t('health.connected')}
              </Text>
            </View>
          ) : (
            <Text variant="bodyStrong" color="textMuted">
              {t('health.notConnected')}
            </Text>
          )}
          <Icon name="forward" size={18} color="textMuted" />
        </Card>
      </Pressable>
      <Text variant="caption" color={problem ? 'danger' : 'textMuted'}>
        {problem
          ? t(`health.${problem}.${healthStore}`)
          : connected
            ? `${t('health.note')} ${t(`health.noData.${healthStore}`)}`
            : t('health.note')}
      </Text>

      {open === 'consent' ? (
        <BiteSheet
          title={t('health.consent.title', { store })}
          body={t('health.consent.body')}
          onClose={() => {
            if (!busy) setOpen(null);
          }}
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
                <Text variant="label">{t(`health.consent.${key}`)}</Text>
              </View>
            ))}
          </Card>
          <Text color="textMuted">{t('health.consent.keeps', { store })}</Text>
          <Button
            label={t('health.consent.continue')}
            loading={busy}
            onPress={() => void connect()}
          />
          <Button
            label={t('health.consent.notNow')}
            variant="secondary"
            disabled={busy}
            onPress={() => setOpen(null)}
          />
          <Text variant="caption" color="textMuted" align="center">
            {t(`health.consent.next.${healthStore}`)}
          </Text>
        </BiteSheet>
      ) : null}

      {open === 'disconnect' ? (
        <Sheet
          onClose={() => {
            if (!busy) setOpen(null);
          }}
        >
          <SheetTitle>{store}</SheetTitle>
          <View style={[styles.row, { gap: spacing.sm }]}>
            <Icon name="check" size={18} color="success" />
            <Text variant="label">{t('health.connected')}</Text>
          </View>
          <Text color="textMuted">{t('health.disconnect.body', { store })}</Text>
          <Button
            label={t('health.disconnect.keep')}
            disabled={busy}
            onPress={() => setOpen(null)}
          />
          <DashedButton
            icon="close"
            label={t('health.disconnect.confirm')}
            tone="danger"
            onPress={() => void disconnect()}
          />
        </Sheet>
      ) : null}

      {open === 'notInstalled' || open === 'updateRequired' ? (
        <BiteSheet
          title={t('health.install.title')}
          body={t(`health.install.${open}`)}
          expression="sad"
          onClose={() => setOpen(null)}
        >
          <Button
            label={t('health.install.open')}
            onPress={() => {
              openHealthStore(open as HealthAvailability);
              setOpen(null);
            }}
          />
          <Button
            label={t('health.consent.notNow')}
            variant="secondary"
            onPress={() => setOpen(null)}
          />
          <Text variant="caption" color="textMuted" align="center">
            {t('health.install.builtIn')}
          </Text>
        </BiteSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    flex: 1,
  },
});
