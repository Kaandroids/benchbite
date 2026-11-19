import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Refusal } from '@/ai/access';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useMonthDayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';

type RefusalCardProps = {
  refusal: Refusal;
  /** When Bite opens again, for a user whose week's or month's use is up. */
  resetsAt?: Date;
};

/**
 * Why the user cannot use Bite now, in place of what asks it: the week's or the month's use is up
 * (board 12), in the chat too, with the day it opens again; on meal photos, the plan has no Bite
 * (board 12b) or a guest needs an account; or, once all users together reach the month's AI spend
 * limit, Bite is taking a short break (ADR 0134); or the user has not consented to the AI
 * features, which it asks for (ADR 0142).
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
      ) : refusal === 'consent_required' ? (
        <Button
          label={t('bite.consent.give')}
          size="small"
          onPress={() => router.push('/ai-consent')}
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
