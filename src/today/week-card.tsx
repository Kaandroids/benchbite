import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { isoWeekday, toIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { StreakBadge } from '@/streak/streak-badge';
import type { Streak } from '@/streak/streak';
import { fonts, useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import {
  dayState,
  type DayState,
  type ScheduleDay,
  type WeekSchedule,
} from '@/workouts/week-schedule';

const RING_SIZE = 32;
const REST_SIZE = 8;
const BADGE_SIZE = 18;

type WeekCardProps = {
  today: Date;
  streak: Streak;
  /** The week after its moves, with the workouts finished in it (ADR 0028). */
  schedule: WeekSchedule;
};

/** The weekday of a day as YYYY-MM-DD, read as local midnight. */
function weekdayOf(date: string): number {
  return isoWeekday(new Date(`${date}T00:00`));
}

/** The mark of a day: a ring for workout days, a dot for rest days, with a badge on top. */
function DayMark({ day, state }: { day: ScheduleDay; state: DayState }) {
  const { colors } = useTheme();
  const done = day.workouts.filter((workout) => workout.status === 'done').length;
  const movedIn = day.workouts.some((workout) => workout.movedFrom !== null);
  const radius = (RING_SIZE - 3) / 2;

  let mark;
  switch (state) {
    case 'rest':
      mark = <View style={[styles.rest, { backgroundColor: colors.track }]} />;
      break;
    case 'extra':
      mark = (
        <View testID="day-extra" style={[styles.extra, { backgroundColor: colors.primaryButton }]}>
          <Icon name="check" size={10} color="onPrimary" />
        </View>
      );
      break;
    case 'partial':
      // The share of the day's workouts that is done, as an arc from the top.
      mark = (
        <View testID="day-partial" style={styles.ring}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={radius}
              stroke={colors.planned}
              strokeWidth={3}
              fill="none"
            />
            <Path
              d={arc(radius, done / day.workouts.length)}
              stroke={colors.primaryButton}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
          <Text color="primaryText" style={styles.fraction}>
            {`${done}/${day.workouts.length}`}
          </Text>
        </View>
      );
      break;
    default:
      mark = (
        <View
          testID={`day-${state}`}
          style={[
            styles.ring,
            state === 'done'
              ? { backgroundColor: colors.primaryButton }
              : state === 'today'
                ? { borderWidth: 3, borderColor: colors.primaryButton }
                : state === 'planned'
                  ? { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.planned }
                  : state === 'movedAway'
                    ? { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.placeholder }
                    : state === 'skipped'
                      ? { backgroundColor: colors.track }
                      : { borderWidth: 2, borderColor: colors.border },
          ]}
        >
          {state === 'done' ? <Icon name="check" size={16} color="onPrimary" /> : null}
          {state === 'missed' ? <Icon name="close" size={14} color="textMuted" /> : null}
          {state === 'skipped' ? <Icon name="minus" size={14} color="textMuted" /> : null}
          {state === 'movedAway' ? <Icon name="arrow" size={14} color="textMuted" /> : null}
        </View>
      );
  }

  return (
    <View style={styles.mark}>
      {mark}
      {/* A workout moved here shows an arrow; otherwise a day with several shows how many. */}
      {movedIn ? (
        <View
          testID="day-moved-in"
          style={[
            styles.badge,
            { backgroundColor: colors.primaryButton, borderColor: colors.surface },
          ]}
        >
          <Icon name="arrow" size={10} color="onPrimary" />
        </View>
      ) : day.workouts.length > 1 && state !== 'partial' ? (
        <View
          style={[styles.badge, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text color="textMuted" style={styles.count}>
            {day.workouts.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** An SVG arc of the given share of a circle, clockwise from the top. */
function arc(radius: number, share: number): string {
  const center = RING_SIZE / 2;
  const angle = 2 * Math.PI * share;
  const x = center + radius * Math.sin(angle);
  const y = center - radius * Math.cos(angle);
  return `M ${center} ${center - radius} A ${radius} ${radius} 0 ${share > 0.5 ? 1 : 0} 1 ${x} ${y}`;
}

/**
 * Today's date, the streak and the week from Monday to Sunday: a ring for each day with workouts,
 * which fills as they are done, and a dot for each rest day. Moved, missed, skipped and extra
 * workouts each have their own mark (ADR 0028).
 */
export function WeekCard({ today, streak, schedule }: WeekCardProps) {
  const { t, i18n } = useTranslation();
  const weekdayName = useWeekdayFormat('short');
  const longWeekday = useWeekdayFormat();
  const workoutName = useWorkoutName();
  const todayOn = toIsoDate(today);
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(today);

  const labelOf = (day: ScheduleDay) =>
    [
      `${weekdayName(day.weekday)} ${Number(day.date.slice(8))}`,
      ...day.workouts.flatMap((workout) => [
        workoutName(workout.session),
        ...(workout.movedFrom
          ? [t('today.week.movedFrom', { day: longWeekday(weekdayOf(workout.movedFrom)) })]
          : []),
        t(`today.week.${workout.status}`),
      ]),
      ...day.movedAway.flatMap((away) => [
        workoutName(away.session),
        t('today.week.movedTo', { day: longWeekday(weekdayOf(away.toOn)) }),
      ]),
      ...(day.extras > 0 ? [t('today.week.extra', { count: day.extras })] : []),
    ].join(', ');

  return (
    <Card entering={FadeInDown.duration(400)}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="headline" accessibilityRole="header">
            {date}
          </Text>
          {schedule.planned > 0 ? (
            <Text variant="caption" color="textMuted" style={styles.bold}>
              {t('today.week.progress', { done: schedule.done, count: schedule.planned })}
            </Text>
          ) : null}
        </View>
        <StreakBadge streak={streak} />
      </View>
      <View style={styles.week}>
        {schedule.days.map((day) => {
          const isToday = day.date === todayOn;
          return (
            <View
              key={day.date}
              accessible
              accessibilityLabel={labelOf(day)}
              accessibilityState={{ selected: isToday }}
              style={styles.day}
            >
              <DayMark day={day} state={dayState(day, todayOn)} />
              <Text
                variant="caption"
                color={isToday ? 'primaryText' : 'textMuted'}
                style={isToday ? styles.today : styles.bold}
              >
                {weekdayName(day.weekday)}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.bold,
  },
  today: {
    fontFamily: fonts.extraBold,
  },
  week: {
    flexDirection: 'row',
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  mark: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rest: {
    width: REST_SIZE,
    height: REST_SIZE,
    borderRadius: REST_SIZE / 2,
  },
  extra: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fraction: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    lineHeight: 14,
  },
  badge: {
    position: 'absolute',
    top: -7,
    right: -9,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    paddingHorizontal: 3,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    lineHeight: 14,
  },
});
