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
import { useTheme, type ColorTokens } from '@/theme';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * The streak month by month (ADR 0047): each day tinted and badged with the week card's flame when
 * it counted and snowflake when it was frozen, and a flame put out when it was missed, and the
 * month summed up. It pages back
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
                      <DayTile state={state} today={key === todayOn}>
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
          <View style={[styles.row, { gap: spacing.xs }]}>
            <LegendTile state="done" />
            <Text variant="caption" color="textMuted">
              {t('progress.streak.legend.done')}
            </Text>
          </View>
          <View style={[styles.row, { gap: spacing.xs }]}>
            <LegendTile state="frozen" />
            <Text variant="caption" color="textMuted">
              {t('progress.streak.legend.frozen')}
            </Text>
          </View>
          <View style={[styles.row, { gap: spacing.xs }]}>
            <LegendTile state="missed" />
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

/**
 * How a day is drawn: tinted in the colour of its mark, the week card's flame when it counted and
 * snowflake when it was frozen, and a flame put out in grey when it was missed.
 */
const TILES = {
  done: { background: 'iconBackground', text: 'primaryText' },
  frozen: { background: 'frozenBackground', text: 'frozen' },
  missed: { background: 'track', text: 'textMuted' },
} as const satisfies Record<
  Exclude<DayState, 'open'>,
  { background: keyof ColorTokens; text: keyof ColorTokens }
>;

type Marked = Exclude<DayState, 'open'>;

/** A day of the calendar: its number on its tile, with its mark in a badge on the corner. */
function DayTile({
  state,
  today,
  children,
}: {
  state: DayState | undefined;
  today: boolean;
  children: string;
}) {
  const { colors, radii } = useTheme();
  const marked = state && state !== 'open' ? state : undefined;
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
function LegendTile({ state }: { state: Marked }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.legendTile, { backgroundColor: colors[TILES[state].background] }]}>
      <StreakMark state={state} size={10} />
    </View>
  );
}

/** A day's mark: a flame, a snowflake, or a flame struck through. */
function StreakMark({ state, size }: { state: Marked; size: number }) {
  const { colors } = useTheme();
  if (state === 'missed') {
    return (
      <View style={{ width: size, height: size }}>
        <Icon name="flame" size={size} color="textMuted" />
        <View
          style={[
            styles.strike,
            {
              width: size * 1.3,
              left: -size * 0.15,
              top: size / 2 - 0.75,
              backgroundColor: colors.textMuted,
            },
          ]}
        />
      </View>
    );
  }
  return (
    <Icon
      name={state === 'done' ? 'flame' : 'snowflake'}
      size={size}
      color={state === 'done' ? 'primary' : 'frozen'}
    />
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
  placeholder: {
    height: 260,
  },
  day: {
    alignItems: 'center',
    paddingVertical: 4,
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
  strike: {
    position: 'absolute',
    height: 1.5,
    transform: [{ rotate: '45deg' }],
  },
  later: {
    opacity: 0.45,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
