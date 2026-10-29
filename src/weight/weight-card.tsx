import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { projectedDate, type WeightGoal } from '@/body/body';
import { Card, type CardProps } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StepButtons } from '@/components/ui/step-buttons';
import { Text } from '@/components/ui/text';
import { ProgressChart } from '@/components/progress-chart';
import { fromIsoDate, toIsoDate, useDateFormat, useMonthDayFormat } from '@/i18n/dates';
import { useWeightFormat, weightIn, type WeightUnit } from '@/i18n/units';
import { clamp } from '@/lib/math';
import { fonts, useTheme } from '@/theme';
import { WEIGHT_RANGE_KG } from '@/weight/range';
import {
  useLogWeight,
  useWeightHistory,
  weightChange,
  type WeightEntry,
  type WeightRange,
} from '@/weight/weights';

const RANGES: readonly WeightRange[] = ['month', 'threeMonths', 'sixMonths', 'year'];

/**
 * How much one press changes the weight. It is a tenth of a kilogram in either unit, because the
 * database stores a tenth of a kilogram, so a tenth of a pound would often not change it.
 */
const STEP_KG = 0.1;
/** How long after the last press the weight is saved, so quick presses are saved once. */
export const SAVE_DELAY_MS = 800;

type WeightCardProps = {
  /** How the card comes in, from the screen that places it. */
  entering?: CardProps['entering'];
  latest: WeightEntry | null;
  unit: WeightUnit;
  today: Date;
  /** The weight the user aims for and the weekly pace, drawn on the chart; none to keep it. */
  goal?: { goal: WeightGoal; targetKg: number; paceKg: number | null } | null;
};

/**
 * The latest weight, with buttons to change today's weight a tenth of a kilogram at a time, how
 * much it changed and a chart of it over a range, with the target weight. The change is saved
 * shortly after the last press.
 */
export function WeightCard({ latest, unit, today, goal = null, entering }: WeightCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const formatWeight = useWeightFormat();
  const formatDate = useDateFormat('medium');
  const monthDay = useMonthDayFormat();
  const logWeight = useLogWeight();
  const [range, setRange] = useState<WeightRange>('threeMonths');
  const history = useWeightHistory(range, today);
  const [draftKg, setDraftKg] = useState<number | null>(null);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; save: () => void } | null>(null);

  // Leaving the screen saves a change that is still waiting.
  useEffect(
    () => () => {
      if (pending.current) {
        clearTimeout(pending.current.timer);
        pending.current.save();
      }
    },
    [],
  );

  const shownKg = draftKg ?? latest?.weightKg;
  const loggedToday = draftKg !== null || latest?.measuredOn === toIsoDate(today);

  const change = (deltaKg: number) => {
    if (shownKg === undefined) {
      return;
    }
    const nextKg = clamp(
      Math.round((shownKg + deltaKg) * 10) / 10,
      WEIGHT_RANGE_KG.min,
      WEIGHT_RANGE_KG.max,
    );
    setDraftKg(nextKg);
    logWeight.reset();
    void Haptics.selectionAsync();
    if (pending.current) {
      clearTimeout(pending.current.timer);
    }
    const save = () => {
      pending.current = null;
      // The draft stays until the saved weight has been loaded again, so the value doesn't jump;
      // a later press, still to be saved, keeps its own (#153).
      logWeight.mutate(nextKg, {
        onSettled: () => setDraftKg((draft) => (draft === nextKg ? null : draft)),
      });
    };
    pending.current = { timer: setTimeout(save, SAVE_DELAY_MS), save };
  };

  const entries = history.data ?? [];
  const trend = weightChange(entries);
  // Toward the target is good news; without one, a change is only a change.
  const towardTarget =
    trend !== null && goal !== null && (goal.goal === 'lose_fat' ? trend < 0 : trend > 0);
  const reached =
    goal !== null &&
    shownKg !== undefined &&
    (goal.goal === 'lose_fat' ? shownKg <= goal.targetKg : shownKg >= goal.targetKg);
  const target =
    goal === null
      ? undefined
      : {
          value: weightIn(unit, goal.targetKg),
          label:
            !reached && shownKg !== undefined && goal.paceKg
              ? t('weight.targetBy', {
                  weight: formatWeight(goal.targetKg, unit),
                  unit,
                  date: monthDay(projectedDate(shownKg, goal.targetKg, goal.paceKg, today)),
                })
              : t('weight.target', { weight: formatWeight(goal.targetKg, unit), unit }),
        };

  return (
    <Card entering={entering}>
      {shownKg === undefined ? (
        <>
          <Text variant="headline">{t('weight.title')}</Text>
          <Text color="textMuted">{t('weight.none')}</Text>
        </>
      ) : (
        <View style={[styles.row, { gap: spacing.md }]}>
          <View style={styles.latest}>
            <Text style={styles.value}>
              {formatWeight(shownKg, unit)}{' '}
              <Text variant="headline" color="textMuted">
                {unit}
              </Text>
            </Text>
            {trend !== null ? (
              <View style={[styles.row, { gap: spacing.xs }]}>
                <Icon
                  name={trend < 0 ? 'arrowDown' : 'arrowUp'}
                  size={14}
                  color={towardTarget ? 'success' : 'textMuted'}
                />
                <Text variant="captionStrong" color={towardTarget ? 'success' : 'textMuted'}>
                  {t(`weight.change.${range}`, {
                    weight: formatWeight(Math.abs(trend), unit),
                    unit,
                  })}
                </Text>
              </View>
            ) : null}
            <Text variant="caption" color="textMuted">
              {loggedToday
                ? t('weight.loggedToday')
                : t('weight.loggedOn', {
                    // A day without a time zone, so it is read as local midnight.
                    date: formatDate(new Date(`${latest?.measuredOn}T00:00`)),
                  })}
            </Text>
          </View>
          <StepButtons
            variant="joined"
            onDecrease={() => change(-STEP_KG)}
            onIncrease={() => change(STEP_KG)}
            decreaseLabel={t('weight.decrease')}
            increaseLabel={t('weight.increase')}
          />
        </View>
      )}
      {logWeight.isError ? <Text color="danger">{t('weight.saveError')}</Text> : null}
      {shownKg !== undefined ? (
        <>
          {history.isPending ? (
            <ActivityIndicator style={styles.chart} accessibilityLabel={t('today.loading')} />
          ) : entries.length > 0 ? (
            <ProgressChart
              points={entries.map((entry) => ({
                date: fromIsoDate(entry.measuredOn),
                value: weightIn(unit, entry.weightKg),
              }))}
              formatValue={(value) => `${formatWeight(value, 'kg')} ${unit}`}
              formatTick={(value) => formatWeight(value, 'kg')}
              scale="whole"
              byDate
              labelLast={false}
              target={target}
              description={t('weight.chart', { count: entries.length })}
            />
          ) : (
            <Text variant="caption" color="textMuted">
              {t('weight.noneInRange')}
            </Text>
          )}
          <SegmentedControl
            options={RANGES.map((value) => ({ value, label: t(`weight.range.${value}`) }))}
            value={range}
            onChange={setRange}
            accessibilityLabel={t('weight.rangeLabel')}
          />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  latest: {
    flex: 1,
    gap: 2,
  },
  value: {
    fontFamily: fonts.black,
    fontSize: 32,
    lineHeight: 38,
  },
  chart: {
    height: 150,
  },
});
