import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useMonthDayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import type { Refusal } from './use-chat';

type RefusalCardProps = {
  refusal: Refusal;
  /** When the month's budget resets, for a user who used it up. */
  resetsAt?: Date;
};

/**
 * In place of the composer, why the user cannot chat with Bite now: the month's use is up
 * (board 12), there is no plan with Bite (board 12b), or a guest needs an account.
 */
export function RefusalCard({ refusal, resetsAt }: RefusalCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const monthDay = useMonthDayFormat();
  const sad = refusal === 'limit_reached';
  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={[styles.row, { gap: spacing.md + 2 }]}>
        <BiteAvatar size={48} expression={sad ? 'sad' : 'neutral'} />
        <View style={[styles.flex, { gap: spacing.xs }]}>
          <Text variant="label">{t(`bite.refusals.${refusal}.title`)}</Text>
          <Text variant="caption" color="textMuted">
            {t(`bite.refusals.${refusal}.message`, {
              date: resetsAt ? monthDay(resetsAt) : '',
            })}
          </Text>
        </View>
      </View>
      {refusal === 'account_required' ? (
        <Button
          label={t('settings.createAccount')}
          size="small"
          onPress={() => router.push('/account/create')}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
});
