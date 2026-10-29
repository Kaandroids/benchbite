import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import {
  fromIsoDate,
  monthsBetween,
  monthWeeks,
  toIsoDate,
  useMonthYearFormat,
  useWeekdayFormat,
} from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { longestRun, markedOf, type DayState, type MarkedState } from '@/streak/streak';
import { StreakBadge } from '@/streak/streak-badge';
import { StreakMark } from '@/streak/streak-mark';
import { useMonthStreak, useStreak, useStreakStart } from '@/streak/use-streak';
import { useTheme, type ColorTokens } from '@/theme';

import { CardLoadState } from './card-load-state';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const MARKS: readonly MarkedState[] = ['done', 'frozen', 'missed'];

/** A marked day's tile, tinted in the colour of its mark. */
const TILES: Record<MarkedState, { background: keyof ColorTokens; text: keyof ColorTokens }> = {
  done: { background: 'iconBackground', text: 'primaryText' },
  frozen: { background: 'frozenBackground', text: 'frozen' },
  missed: { background: 'track', text: 'textMuted' },
};

/**
 * The streak month by month (ADR 0047): each day a tile tinted and badged with its mark, the week
 * card's flame when it counted and snowflake when it was frozen, and a flame put out when it was
 * missed, then the month summed up. It pages back to the month the streak started in and forward
 * to this one.
 */
export function StreakCalendarScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const weekday = useWeekdayFormat('short');
  const monthTitle = useMonthYearFormat();
  const today = new Date();
  const { streak, freezes } = useStreak(today);
  const startedOn = useStreakStart().data ?? undefined;
  // How many months back the month shown is, 0 for this month.
  const [monthsBack, setMonthsBack] = useState(0);
  const month = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  const states = useMonthStreak(today, month);

  const firstMonthsBack = startedOn ? monthsBetween(fromIsoDate(startedOn), today) : 0;
  const todayOn = toIsoDate(today);
  const days = Object.entries(states.data ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, state]) => state);
  const count = (state: DayState) => days.filter((day) => day === state).length;

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
            {monthTitle(month)}
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
          <CardLoadState query={states} error={t('progress.streak.error')} />
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
            {monthWeeks(month).map((week) => (
              <View key={toIsoDate(week.find(Boolean)!)} style={styles.row}>
                {week.map((date, index) => {
                  if (!date) {
                    return <View key={index} style={styles.flex} />;
                  }
                  const key = toIsoDate(date);
                  const marked = markedOf(states.data?.[key]);
                  return (
                    <View
                      key={key}
                      accessible
                      accessibilityLabel={[
                        date.getDate(),
                        marked ? t(`progress.streak.states.${marked}`) : null,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      style={[styles.flex, styles.day, key > todayOn && styles.later]}
                    >
                      <DayTile marked={marked} today={key === todayOn}>
                        {format(date.getDate())}
                      </DayTile>
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
          {MARKS.map((state) => (
            <View key={state} style={[styles.row, { gap: spacing.xs }]}>
              <LegendTile state={state} />
              <Text variant="caption" color="textMuted">
                {t(`progress.streak.legend.${state}`)}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      {states.data ? (
        <Card style={[styles.row, { gap: spacing.md }]}>
          <Stat value={format(count('done'))} label={t('progress.streak.done')} />
          <Stat value={format(count('frozen'))} label={t('progress.streak.frozen')} />
          <Stat value={format(longestRun(days))} label={t('progress.streak.longest')} />
        </Card>
      ) : null}
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

/** A day of the calendar: its number on its tile, with its mark in a badge on the corner. */
function DayTile({
  marked,
  today,
  children,
}: {
  marked: MarkedState | undefined;
  today: boolean;
  children: string;
}) {
  const { colors, radii } = useTheme();
  return (
    <View
      style={[
        styles.tile,
        {
          borderRadius: radii.md,
          backgroundColor: marked ? colors[TILES[marked].background] : undefined,
          borderColor: today ? colors.text : 'transparent',
        },
      ]}
    >
      <Text variant="bodyStrong" color={marked ? TILES[marked].text : 'textMuted'}>
        {children}
      </Text>
      {marked ? (
        <View style={[styles.badge, { backgroundColor: colors.surface }]}>
          <StreakMark state={marked} size={12} />
        </View>
      ) : null}
    </View>
  );
}

/** A tile of the legend, with the mark it stands for. */
function LegendTile({ state }: { state: MarkedState }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.legendTile, { backgroundColor: colors[TILES[state].background] }]}>
      <StreakMark state={state} size={10} />
    </View>
  );
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
  day: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  later: {
    opacity: 0.45,
  },
  tile: {
    width: 38,
    height: 38,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendTile: {
    width: 16,
    height: 16,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
