import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BiteSheet } from '@/coach/bite-sheet';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useIsAccount } from '@/providers/session-provider';
import { useTheme, type ColorTokens } from '@/theme';

import { useDeleteAccount } from './account';

/** What goes, as the user knows it; the database deletes the rest with them. */
const WHAT_GOES: {
  key: 'workouts' | 'meals' | 'progress' | 'bite';
  icon: IconName;
  color: keyof ColorTokens;
  background: keyof ColorTokens;
}[] = [
  { key: 'workouts', icon: 'dumbbell', color: 'lunch', background: 'lunchBackground' },
  { key: 'meals', icon: 'meal', color: 'breakfast', background: 'breakfastBackground' },
  { key: 'progress', icon: 'chart', color: 'water', background: 'waterBackground' },
  { key: 'bite', icon: 'chat', color: 'dinner', background: 'dinnerBackground' },
];

/**
 * Says what deleting takes, with keeping it as the main button; deleting asks once more in a sheet.
 * Once deleted the app starts over as a new guest, which leaves this screen by itself.
 */
export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const isAccount = useIsAccount();
  const deleteAccount = useDeleteAccount();
  const [asking, setAsking] = useState(false);
  const deleting = deleteAccount.isPending;

  return (
    <Screen
      onBack={() => router.back()}
      footer={
        <View style={{ gap: spacing.md }}>
          {deleteAccount.isError ? (
            <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="polite">
              {t('account.delete.failed')}
            </Text>
          ) : null}
          <Button
            label={t(isAccount ? 'account.delete.keep' : 'account.delete.keepGuest')}
            onPress={() => router.back()}
          />
          <TextLink
            label={t(isAccount ? 'account.delete.delete' : 'account.delete.deleteGuest')}
            tone="danger"
            size="regular"
            onPress={() => setAsking(true)}
          />
        </View>
      }
    >
      <View style={{ gap: spacing.sm }}>
        <Text variant="title" accessibilityRole="header">
          {t(isAccount ? 'account.delete.title' : 'account.delete.titleGuest')}
        </Text>
        <Text color="textMuted">{t('account.delete.body')}</Text>
      </View>
      <Card list style={{ marginTop: spacing.xl }}>
        {WHAT_GOES.map(({ key, icon, color, background }, index) => (
          <View
            key={key}
            style={[
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.sm },
              listDivider(index === 0, colors.border),
            ]}
          >
            <IconTile name={icon} size={36} color={color} background={background} />
            <Text variant="label" style={styles.flex}>
              {t(`account.delete.${key}`)}
            </Text>
          </View>
        ))}
      </Card>
      {asking ? (
        <BiteSheet
          title={t('account.delete.sheetTitle')}
          body={t('account.delete.sheetBody')}
          expression="sad"
          // It cannot be called back while it runs, so the sheet stays until it is decided.
          onClose={() => {
            if (!deleting) setAsking(false);
          }}
        >
          <Button
            label={t('account.delete.confirm')}
            variant="danger"
            loading={deleting}
            onPress={() => deleteAccount.mutate(undefined, { onError: () => setAsking(false) })}
          />
          <Button
            label={t('account.delete.notNow')}
            variant="secondary"
            disabled={deleting}
            onPress={() => setAsking(false)}
          />
        </BiteSheet>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  flex: {
    flex: 1,
  },
});
