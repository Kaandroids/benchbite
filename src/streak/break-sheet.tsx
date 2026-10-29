import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { fromIsoDate, useDayFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';
import type { WeekSchedule } from '@/workouts/week-schedule';

import { MissedDayRows } from './missed-day';
import type { StreakBreak } from './streak';
import { useAnswerBreak } from './use-streak';

type BreakSheetProps = {
  streakBreak: StreakBreak;
  today: Date;
  /** This week, for postponing a missed workout of it. */
  schedule: WeekSchedule;
  /** Opens a missed day that can still be logged. */
  onLog: (day: string) => void;
  /**
   * Called once the break is answered or a workout postponed, with a message on the freezes used
   * or where the workout went, none when starting again.
   */
  onAnswered: (message: string | null) => void;
};

/**
 * The streak broke on missed days (ADR 0042). Each day says what kept it from counting, with what
 * mends it first: postponing a workout of this week, logging a meal within the week (#278). They
 * can also be frozen, one freeze each, when the freezes cover them all; else the streak starts
 * again.
 */
export function BreakSheet({ streakBreak, today, schedule, onLog, onAnswered }: BreakSheetProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const dayFormat = useDayFormat();
  const answer = useAnswerBreak();
  const { freezes, savedCount } = streakBreak;
  const missed = streakBreak.days.map(({ day }) => day);
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
      <Card>
        <View style={{ gap: spacing.lg }}>
          {streakBreak.days.map((missedDay) => (
            <MissedDayRows
              key={missedDay.day}
              missedDay={missedDay}
              schedule={schedule}
              today={today}
              onLog={onLog}
              onMoved={onAnswered}
            />
          ))}
        </View>
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
