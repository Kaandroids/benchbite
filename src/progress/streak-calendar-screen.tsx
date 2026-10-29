import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { addDays, fromIsoDate, toIsoDate, useWeekdayFormat, weekStart } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { longestRun, type DayState } from '@/streak/streak';
import { StreakBadge } from '@/streak/streak-badge';
import { useMonthStreak, useStreak, useStreakStart } from '@/streak/use-streak';
import { useTheme } from '@/theme';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * The streak month by month (ADR 0047): each day marked with the week card's flame when it counted
 * and snowflake when it was frozen, and a red cross when it was missed, and the month summed up. It pages back
 * to the month the streak started in and forward to this one.
 */
export function StreakCalendarScreen() {
  const { t, i18n } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const weekday = useWeekdayFormat('short');
  const today = new Date();
  const { streak, freezes } = useStreak(today);
  const startedOn = useStreakStart().data ?? undefined;
  // How many months back the month shown is, 0 for this month.
  const [monthsBack, setMonthsBack] = useState(0);
  const month = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  const states = useMonthStreak(today, month);

  const first = startedOn ? fromIsoDate(startedOn) : today;
  const firstMonthsBack =
    (today.getFullYear() - first.getFullYear()) * 12 + today.getMonth() - first.getMonth();
  const todayOn = toIsoDate(today);
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' });

  // The weeks of the month, from Monday; days of the months beside it left out.
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const weeks: (Date | null)[][] = [];
  for (let monday = weekStart(month); monday <= end; monday = addDays(monday, 7)) {
    weeks.push(
      WEEKDAYS.map((offset) => {
        const day = addDays(monday, offset - 1);
        return day.getMonth() === month.getMonth() ? day : null;
      }),
    );
  }
  const days = Object.entries(states.data ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, state]) => state);
  const count = (state: DayState) => days.filter((day) => day === state).length;
  const stateLabel = (state: DayState | undefined) =>
    state === 'done' || state === 'frozen' || state === 'missed'
      ? t(`progress.streak.states.${state}`)
      : null;

  return (
    <Screen
      onBack={() => router.back()}
      title={t('progress.streak.title')}
      action={<StreakBadge streak={streak} />}
    >
      <Card>
        <View style={[styles.row, { gap: spacing.sm }]}>
          <RoundIconButton
            icon="left"
            color="text"
            background="surface"
            label={t('progress.streak.previous')}
            disabled={monthsBack >= firstMonthsBack}
            onPress={() => setMonthsBack((back) => back + 1)}
          />
          <Text variant="headline" align="center" accessibilityRole="header" style={styles.flex}>
            {monthName.format(month)}
          </Text>
          <RoundIconButton
            icon="forward"
            color="text"
            background="surface"
            label={t('progress.streak.next')}
            disabled={monthsBack === 0}
            onPress={() => setMonthsBack((back) => back - 1)}
          />
        </View>
        {states.data === undefined ? (
          <ActivityIndicator
            style={styles.placeholder}
            color={colors.primary}
            accessibilityLabel={t('common.loading')}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            <View style={styles.row} importantForAccessibility="no-hide-descendants">
              {WEEKDAYS.map((day) => (
                <Text
                  key={day}
                  variant="caption"
                  color="textMuted"
                  align="center"
                  style={styles.flex}
                >
                  {weekday(day)}
                </Text>
              ))}
            </View>
            {weeks.map((week) => (
              <View key={toIsoDate(week.find(Boolean)!)} style={styles.row}>
                {week.map((date, index) => {
                  if (!date) {
                    return <View key={index} style={styles.flex} />;
                  }
                  const key = toIsoDate(date);
                  const state = states.data?.[key];
                  const label = stateLabel(state);
                  return (
                    <View
                      key={key}
                      accessible
                      accessibilityLabel={[date.getDate(), label].filter(Boolean).join(', ')}
                      style={[styles.flex, styles.day, key > todayOn && styles.later]}
                    >
                      <Text
                        variant={key === todayOn ? 'label' : 'bodyStrong'}
                        color={key === todayOn ? 'primaryText' : 'textMuted'}
                      >
                        {format(date.getDate())}
                      </Text>
                      <View style={styles.mark}>
                        {state && state !== 'open' ? <StreakMark state={state} size={14} /> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
        <View
          style={[styles.legend, { gap: spacing.md }]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <View style={[styles.row, { gap: spacing.xs }]}>
            <StreakMark state="done" size={12} />
            <Text variant="caption" color="textMuted">
              {t('progress.streak.legend.done')}
            </Text>
          </View>
          <View style={[styles.row, { gap: spacing.xs }]}>
            <StreakMark state="frozen" size={12} />
            <Text variant="caption" color="textMuted">
              {t('progress.streak.legend.frozen')}
            </Text>
          </View>
          <View style={[styles.row, { gap: spacing.xs }]}>
            <StreakMark state="missed" size={12} />
            <Text variant="caption" color="textMuted">
              {t('progress.streak.legend.missed')}
            </Text>
          </View>
        </View>
      </Card>
      <Card style={[styles.row, { gap: spacing.md }]}>
        <Stat value={format(count('done'))} label={t('progress.streak.done')} />
        <Stat value={format(count('frozen'))} label={t('progress.streak.frozen')} />
        <Stat value={format(longestRun(days))} label={t('progress.streak.longest')} />
      </Card>
      {freezes !== undefined ? (
        <View style={[styles.row, styles.center, { gap: spacing.xs }]}>
          <Icon name="snowflake" size={14} color="frozen" />
          <Text variant="caption" color="textMuted">
            {t('progress.streak.freezes', { count: freezes })}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

/** A day's mark: the week card's flame or snowflake, or a red cross for a day that broke it. */
const MARKS = {
  done: { name: 'flame', color: 'primary' },
  frozen: { name: 'snowflake', color: 'frozen' },
  missed: { name: 'close', color: 'danger' },
} as const;

function StreakMark({ state, size }: { state: Exclude<DayState, 'open'>; size: number }) {
  return <Icon name={MARKS[state].name} size={size} color={MARKS[state].color} />;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.flex}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
  },
  placeholder: {
    height: 260,
  },
  day: {
    alignItems: 'center',
    height: 44,
    gap: 2,
  },
  later: {
    opacity: 0.45,
  },
  mark: {
    width: 14,
    height: 14,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
