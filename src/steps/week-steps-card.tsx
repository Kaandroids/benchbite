import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useStoreName } from '@/health/use-store-name';
import { addDays, sameDay, toIsoDate, useWeekdayFormat, weekStart } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { CardLoadState } from '@/components/card-load-state';
import { fonts, useTheme } from '@/theme';

import { READS } from '@/health/reads';

import { averageSteps, pastDays, useStepDays } from './steps';

const BAR_HEIGHT = 64;

type WeekStepsCardProps = {
  entering?: CardProps['entering'];
  today: Date;
};

/**
 * Today's steps and the week's, from Monday, as the health store counted them (#469), with the
 * week's average a day. Shown while steps are read.
 */
export function WeekStepsCard({ entering, today }: WeekStepsCardProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const weekday = useWeekdayFormat('narrow');
  const longWeekday = useWeekdayFormat('long');
  const store = useStoreName() ?? '';
  const monday = weekStart(today);
  const days = useStepDays(monday, today);
  const look = READS.steps;

  if (days.data === undefined) {
    return (
      <Card entering={entering}>
        <CardLoadState query={days} error={t('steps.error')} />
      </Card>
    );
  }

  const byDay = new Map(days.data.map(({ day, steps }) => [day, steps]));
  const todaySteps = byDay.get(toIsoDate(today));
  if (days.data.length === 0) {
    return (
      <Card entering={entering}>
        <View style={[styles.row, { gap: spacing.md }]}>
          <IconTile name={look.icon} size={40} color={look.color} background={look.background} />
          <View style={styles.flex}>
            <Text variant="label">{t('steps.noneTitle')}</Text>
            <Text variant="caption" color="textMuted">
              {t('steps.noneBody', { store })}
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    // Monday is ISO weekday 1.
    return {
      date,
      isoWeekday: index + 1,
      steps: date > today ? null : (byDay.get(toIsoDate(date)) ?? 0),
    };
  });
  const most = Math.max(1, ...week.map(({ steps }) => steps ?? 0));
  // Today is still being counted; before the week has a day that is over, there is no average.
  const average = averageSteps(pastDays(days.data, today));
  const count = todaySteps ?? 0;

  return (
    <Card entering={entering}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <IconTile name={look.icon} size={40} color={look.color} background={look.background} />
        <View style={styles.flex}>
          <Text style={styles.value}>
            {format(count)}{' '}
            <Text variant="label" color="textMuted">
              {t('steps.today', { count })}
            </Text>
          </Text>
          <Text variant="caption" color="textMuted">
            {t('steps.fromStore', { store })}
          </Text>
        </View>
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('steps.weekLabel', {
          days: week
            .filter(({ steps }) => steps !== null)
            .map(({ isoWeekday, steps }) =>
              t('steps.dayLabel', { day: longWeekday(isoWeekday), steps: format(steps ?? 0) }),
            )
            .join(', '),
        })}
        style={[styles.bars, { gap: spacing.sm }]}
      >
        {week.map(({ date, isoWeekday, steps }) => {
          const isToday = sameDay(date, today);
          return (
            <View key={date.toISOString()} style={[styles.day, { gap: spacing.xs }]}>
              <View style={[styles.track, { height: BAR_HEIGHT }]}>
                {steps !== null ? (
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(4, (steps / most) * BAR_HEIGHT),
                        backgroundColor: colors.info,
                        opacity: isToday ? 1 : 0.4,
                      },
                    ]}
                  />
                ) : null}
              </View>
              <Text
                variant="captionStrong"
                color={isToday ? 'primaryText' : 'textMuted'}
                importantForAccessibility="no"
              >
                {weekday(isoWeekday)}
              </Text>
            </View>
          );
        })}
      </View>
      {average !== null ? (
        <Text variant="captionStrong" color="textMuted">
          {t('steps.weekAverage', { steps: format(Math.round(average)) })}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 6,
    width: '100%',
  },
  bars: {
    flexDirection: 'row',
  },
  day: {
    alignItems: 'center',
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  track: {
    justifyContent: 'flex-end',
    width: '100%',
  },
  value: {
    fontFamily: fonts.black,
    fontSize: 26,
    lineHeight: 32,
  },
});
