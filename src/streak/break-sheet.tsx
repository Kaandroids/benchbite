import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { fromIsoDate, useDayFormat, useWeekdayDateFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { canLog } from '@/nutrition/meals';
import { useTheme } from '@/theme';

import type { StreakBreak } from './streak';
import { useAnswerBreak } from './use-streak';

type BreakSheetProps = {
  streakBreak: StreakBreak;
  today: Date;
  /** Opens a missed day that can still be logged. */
  onLog: (day: string) => void;
  /** Called once the break is answered, with a message on the freezes used, none without. */
  onAnswered: (message: string | null) => void;
};

/**
 * The streak broke on missed days (ADR 0042): each can still be logged within the week, and they
 * can be frozen, one freeze each, when the freezes cover them all; else the streak starts again.
 */
export function BreakSheet({ streakBreak, today, onLog, onAnswered }: BreakSheetProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const dayFormat = useDayFormat();
  const shortDay = useWeekdayDateFormat();
  const answer = useAnswerBreak();
  const { missed, freezes, savedCount } = streakBreak;
  const enough = freezes >= missed.length;
  const day = (date: string) => dayFormat(fromIsoDate(date));

  /** What freezing the missed days did: which day, or how many, and the freezes left. */
  const kept = () => {
    const left = freezes - missed.length;
    return missed.length === 1
      ? t('streak.break.kept', { count: left, day: day(missed[0]!) })
      : t('streak.break.keptDays', { count: left, days: format(missed.length) });
  };
  const answerWith = (useFreezes: boolean) =>
    answer.mutate(
      { today, useFreezes },
      { onSuccess: () => onAnswered(useFreezes ? kept() : null) },
    );

  return (
    <>
      <View style={[styles.center, { gap: spacing.sm }]}>
        <View style={[styles.icon, { backgroundColor: colors.track }]}>
          <Icon name="flame" size={36} color="textMuted" />
        </View>
        <Text variant="headline" align="center" accessibilityRole="header">
          {t('streak.break.title')}
        </Text>
        <Text color="textMuted" align="center">
          {missed.length === 1
            ? t('streak.break.oneDay', { day: day(missed[0]!) })
            : t('streak.break.days', { count: missed.length })}
          {enough
            ? null
            : ` ${freezes === 0 ? t('streak.break.noFreezes') : t('streak.break.notEnough', { count: freezes })}`}
        </Text>
      </View>
      <Card list>
        <View style={{ paddingVertical: spacing.md }}>
          <Text variant="bodyStrong">{t('streak.break.forgot')}</Text>
          <Text variant="caption" color="textMuted">
            {t('streak.break.forgotHint')}
          </Text>
        </View>
        {missed.map((date) => (
          <View
            key={date}
            style={[styles.row, { paddingVertical: spacing.md }, listDivider(false, colors.border)]}
          >
            <Text variant="bodyStrong" style={styles.flex}>
              {shortDay(fromIsoDate(date))}
            </Text>
            {canLog(date, today) ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('streak.break.logDay', { day: shortDay(fromIsoDate(date)) })}
                onPress={() => onLog(date)}
                hitSlop={8}
              >
                <Text variant="label" color="primaryText">
                  {t('streak.break.log')}
                </Text>
              </Pressable>
            ) : (
              <Text variant="caption" color="textMuted">
                {t('streak.break.tooLate')}
              </Text>
            )}
          </View>
        ))}
      </Card>
      {answer.isError ? <FormError>{t('streak.break.error')}</FormError> : null}
      {enough ? (
        <View style={{ gap: spacing.sm }}>
          <Button
            label={t('streak.break.startAgain')}
            variant="secondary"
            loading={answer.isPending && !answer.variables?.useFreezes}
            disabled={answer.isPending}
            onPress={() => answerWith(false)}
          />
          <Button
            label={t('streak.break.freeze', {
              count: missed.length,
              keep: t('streak.break.keepDays', { count: savedCount }),
            })}
            loading={answer.isPending && answer.variables?.useFreezes}
            disabled={answer.isPending}
            onPress={() => answerWith(true)}
          />
          <View style={[styles.row, styles.centerRow, { gap: spacing.xs }]}>
            <Icon name="snowflake" size={18} color="textMuted" />
            <Text variant="bodyStrong" color="textMuted">
              {t('streak.break.freezes', { count: freezes })}
            </Text>
          </View>
        </View>
      ) : (
        <Button
          label={t('streak.break.newStreak')}
          loading={answer.isPending}
          onPress={() => answerWith(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centerRow: {
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
