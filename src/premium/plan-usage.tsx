import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Caption } from '@/components/ui/caption';
import { Card, listDivider } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { isoWeekday, useMonthDayFormat, useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import type { PlanSummary, Window } from './plan';

type FreeSummary = Extract<PlanSummary, { plan: 'free' }>;
type PaidSummary = Exclude<PlanSummary, FreeSummary>;

/** The free plan's meal photos this week, as a number and a bar, and when new ones come. */
export function FreeUsage({ photos }: { photos: FreeSummary['photos'] }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const weekday = useWeekdayFormat('long');
  return (
    <Card style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Tag label={t('premium.mine.free')} tone="neutral" />
        <Text variant="bodyStrong" style={styles.flex}>
          {t('premium.mine.photos')}
        </Text>
        <Text variant="bodyStrong">
          {t('premium.mine.photosCount', { left: photos.left, count: photos.perWeek })}
        </Text>
      </View>
      <ProgressBar
        value={photos.perWeek === 0 ? 0 : photos.left / photos.perWeek}
        accessible={false}
      />
      <Text variant="caption" color="textMuted">
        {t('premium.mine.photosLeft', {
          count: photos.left,
          day: weekday(isoWeekday(photos.resetsAt)),
        })}
      </Text>
    </Card>
  );
}

/**
 * The trial's or premium's plan: how it is billed and when it renews or ends, and how much of Bite
 * is left this week and this period, as a bar and a share, never in money.
 */
export function PaidUsage({ summary }: { summary: PaidSummary }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const weekday = useWeekdayFormat('long');
  const monthDay = useMonthDayFormat();
  const trial = summary.plan === 'trial';
  return (
    <Card style={{ gap: 0, paddingVertical: spacing.md }}>
      <View style={[styles.row, { gap: spacing.sm, paddingBottom: spacing.md }]}>
        <Tag label={t(trial ? 'premium.mine.trial' : 'premium.mine.premium')} />
        <Text variant="bodyStrong" style={styles.flex}>
          {t(summary.billing === 'yearly' ? 'premium.mine.yearly' : 'premium.mine.monthly')}
        </Text>
        <Text variant="caption" color="textMuted">
          {t(trial ? 'premium.mine.ends' : 'premium.mine.renews', {
            day: monthDay(summary.renewsAt),
          })}
        </Text>
      </View>
      <Caption>{t('premium.mine.biteLeft')}</Caption>
      {summary.week ? (
        <Meter
          label={t('premium.mine.week')}
          window={summary.week}
          note={t('premium.mine.newWeek', { day: weekday(isoWeekday(summary.week.resetsAt)) })}
        />
      ) : null}
      <Meter
        label={t('premium.mine.period')}
        window={summary.period}
        note={t('premium.mine.startsAgain', { day: monthDay(summary.period.resetsAt) })}
      />
    </Card>
  );
}

/** One window: its name and the share left, a bar of it, and when it starts again. */
function Meter({ label, window, note }: { label: string; window: Window; note: string }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const percent = t('premium.mine.percent', { percent: Math.round(window.left * 100) });
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${t('premium.mine.leftLabel', { percent })}. ${note}`}
      style={[{ gap: spacing.xs, paddingVertical: spacing.md }, listDivider(false, colors.border)]}
    >
      <View style={styles.row}>
        <Text variant="bodyStrong" style={styles.flex}>
          {label}
        </Text>
        <Text variant="bodyStrong">{percent}</Text>
      </View>
      <ProgressBar value={window.left} accessible={false} />
      <Text variant="caption" color="textMuted">
        {note}
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
});
