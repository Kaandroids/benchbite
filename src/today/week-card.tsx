import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Card, type CardProps } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { toIsoDate, useDayFormat, useWeekdayFormat, weekdayOf } from '@/i18n/dates';
import { StreakBadge } from '@/streak/streak-badge';
import type { Streak } from '@/streak/streak';
import { fonts, useTheme, type ColorTokens } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import {
  dayState,
  hasWorkouts,
  type DayState,
  type ScheduleDay,
  type WeekSchedule,
} from '@/workouts/week-schedule';

const RING_SIZE = 32;
const REST_SIZE = 8;
const BADGE_SIZE = 18;

type WeekCardProps = {
  /** How the card comes in, from the screen that places it. */
  entering?: CardProps['entering'];
  today: Date;
  streak: Streak;
  /** The week after its moves, with the workouts finished in it (ADR 0028). */
  schedule: WeekSchedule;
  /** Opens a day with workouts, or with workouts that moved away from it. */
  onDayPress: (day: ScheduleDay) => void;
  /** Shown under the days, inside the card. */
  children?: ReactNode;
};

type RingState = Exclude<DayState, 'rest' | 'extra' | 'partial'>;

/** The look of each ring: its fill or border, and the icon inside it. */
function ringOf(state: RingState, colors: ColorTokens): { style: ViewStyle; icon?: IconName } {
  const rings: Record<RingState, { style: ViewStyle; icon?: IconName }> = {
    done: { style: { backgroundColor: colors.primaryButton }, icon: 'check' },
    today: { style: { borderWidth: 3, borderColor: colors.primaryButton } },
    planned: { style: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.planned } },
    missed: { style: { borderWidth: 2, borderColor: colors.border }, icon: 'close' },
    skipped: { style: { backgroundColor: colors.track }, icon: 'minus' },
    movedAway: {
      style: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.placeholder },
      icon: 'arrow',
    },
  };
  return rings[state];
}

/** The mark of a day: a ring for workout days, a dot for rest days, with a badge on top. */
function DayMark({ day, state }: { day: ScheduleDay; state: DayState }) {
  const { colors } = useTheme();
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
              d={arc(radius, day.done / day.total)}
              stroke={colors.primaryButton}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
          <Text color="primaryText" style={styles.fraction}>
            {`${day.done}/${day.total}`}
          </Text>
        </View>
      );
      break;
    default: {
      const ring = ringOf(state, colors);
      mark = (
        <View testID={`day-${state}`} style={[styles.ring, ring.style]}>
          {ring.icon ? (
            <Icon
              name={ring.icon}
              size={state === 'done' ? 16 : 14}
              color={state === 'done' ? 'onPrimary' : 'textMuted'}
            />
          ) : null}
        </View>
      );
    }
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
export function WeekCard({
  today,
  streak,
  schedule,
  onDayPress,
  children,
  entering,
}: WeekCardProps) {
  const { t } = useTranslation();
  const weekdayName = useWeekdayFormat('short');
  const longWeekday = useWeekdayFormat();
  const workoutName = useWorkoutName();
  const todayOn = toIsoDate(today);
  const formatDay = useDayFormat();

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
    <Card entering={entering}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="headline" accessibilityRole="header">
            {formatDay(today)}
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
          const opens = hasWorkouts(day);
          return (
            <Pressable
              key={day.date}
              accessible
              accessibilityRole={opens ? 'button' : undefined}
              accessibilityLabel={labelOf(day)}
              accessibilityHint={opens ? t('today.week.open') : undefined}
              accessibilityState={{ selected: isToday }}
              onPress={opens ? () => onDayPress(day) : undefined}
              style={({ pressed }) => [styles.day, { opacity: pressed ? 0.6 : 1 }]}
            >
              <DayMark day={day} state={dayState(day, todayOn)} />
              <Text
                variant={isToday ? 'captionStrong' : 'caption'}
                color={isToday ? 'primaryText' : 'textMuted'}
                style={isToday ? null : styles.bold}
              >
                {weekdayName(day.weekday)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {children}
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
