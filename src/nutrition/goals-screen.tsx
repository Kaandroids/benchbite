import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { isTargetReached, projectedDate } from '@/body/body';
import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { IconTile } from '@/components/ui/icon-tile';
import { KeyboardAvoiding } from '@/components/ui/keyboard-avoiding';
import { Note } from '@/components/ui/note';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { useMonthDayFormat } from '@/i18n/dates';
import { useNumberFormat, weightIn } from '@/i18n/units';
import { typography, useTheme } from '@/theme';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

import { BASIS_ICONS } from './basis-icons';
import { MacroDot } from './macro-dot';
import { MACROS } from './macro-targets';
import {
  useCalculatedTargets,
  useOwnTargets,
  useSetOwnTargets,
  useTargetBasis,
  useUseCalculatedTargets,
  type NutritionTargets,
  type TargetBasis,
} from './targets';
import { readTargetsForm, targetsFormOf, type TargetsForm } from './targets-form';

type Mode = 'calculated' | 'own';

/**
 * The daily goals (ADR 0039): the calculated ones with what they are worked out from, or the
 * user's own, typed in. Choosing Calculated puts them back in use at once; one's own are saved.
 * Calculate again asks for a new goal, target, pace and activity.
 */
export function GoalsScreen() {
  const calculated = useCalculatedTargets();
  const own = useOwnTargets();
  const basis = useTargetBasis();
  const queries = [calculated, own, basis];
  if (allLoaded(queries) && calculated.data) {
    return (
      <GoalsBody calculated={calculated.data} own={own.data ?? null} basis={basis.data ?? null} />
    );
  }
  return (
    <Screen onBack={() => router.back()}>
      <LoadState queries={queries} />
    </Screen>
  );
}

type GoalsBodyProps = {
  calculated: NutritionTargets;
  own: { targets: NutritionTargets; inUse: boolean } | null;
  basis: TargetBasis | null;
};

function GoalsBody({ calculated, own, basis }: GoalsBodyProps) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const { spacing } = useTheme();
  const setOwn = useSetOwnTargets();
  const useCalculated = useUseCalculatedTargets();
  const [mode, setMode] = useState<Mode>(own?.inUse ? 'own' : 'calculated');
  // One's own start from the last ones set, else from the calculated ones.
  const [form, setForm] = useState<TargetsForm>(() => targetsFormOf(own?.targets ?? calculated));
  const result = readTargetsForm(form);

  const choose = (next: Mode) => {
    // One switch at a time, so that a quick Save cannot reach the server before it.
    if (useCalculated.isPending) {
      return;
    }
    setMode(next);
    if (next === 'calculated' && own?.inUse) {
      // Back to one's own when the switch fails, as they are still the ones in use.
      useCalculated.mutate(undefined, { onError: () => setMode('own') });
    }
  };
  const save = () => {
    if (result.kind === 'valid') {
      setOwn.mutate(result.targets, { onSuccess: () => router.back() });
    }
  };

  return (
    <KeyboardAvoiding>
      <Screen
        onBack={() => router.back()}
        title={t('nutrition.goals.title')}
        footer={
          mode === 'own' ? (
            <View style={{ gap: spacing.md }}>
              {setOwn.isError ? <FormError>{t('nutrition.goals.saveError')}</FormError> : null}
              <Button
                label={t('nutrition.goals.save')}
                loading={setOwn.isPending}
                disabled={result.kind !== 'valid' || useCalculated.isPending}
                onPress={save}
              />
            </View>
          ) : (
            <Button
              label={t('nutrition.goals.again')}
              disabled={useCalculated.isPending}
              onPress={() =>
                router.push({ pathname: '/nutrition/recalculate/[step]', params: { step: 'goal' } })
              }
            />
          )
        }
      >
        <SegmentedControl
          accessibilityLabel={t('nutrition.goals.modes')}
          options={[
            { value: 'calculated', label: t('nutrition.goals.calculated') },
            { value: 'own', label: t('nutrition.goals.own') },
          ]}
          value={mode}
          onChange={choose}
        />
        {mode === 'calculated' ? (
          <>
            <ReadTargets targets={calculated} />
            {basis ? <BasisList basis={basis} /> : null}
            <Text variant="caption" color="textMuted">
              {t('nutrition.goals.note')}
            </Text>
            {useCalculated.isError ? <FormError>{t('nutrition.goals.saveError')}</FormError> : null}
          </>
        ) : (
          <>
            <EditTargets form={form} onChange={(change) => setForm({ ...form, ...change })} />
            {result.kind === 'tooMuchMacros' ? (
              <FormError>
                {t('nutrition.goals.tooMuch', {
                  macros: format(result.macroCalories),
                  calories: format(result.calories),
                })}
              </FormError>
            ) : result.kind === 'incomplete' ? (
              <FormError>{t('nutrition.goals.limits')}</FormError>
            ) : (
              <>
                {/* Allowed, as some eat less under a doctor's care, but not without a word. */}
                {basis?.calorieFloor != null && result.targets.calories < basis.calorieFloor ? (
                  <Note tone="warning">
                    {t('nutrition.goals.belowFloor', {
                      calories: format(result.targets.calories),
                      floor: format(basis.calorieFloor),
                    })}
                  </Note>
                ) : null}
                <Text variant="caption" color="textMuted">
                  {t('nutrition.goals.macrosMake', {
                    macros: format(result.macroCalories),
                    calories: format(result.targets.calories),
                  })}
                </Text>
              </>
            )}
          </>
        )}
      </Screen>
    </KeyboardAvoiding>
  );
}

/** The calories, then each macro with its dot: one row frame, with what it holds on the right. */
function TargetRows({ value }: { value: (field: keyof TargetsForm, first: boolean) => ReactNode }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <Card list>
      <View style={[styles.row, { paddingVertical: spacing.md }]}>
        <Text color="textMuted" style={styles.name}>
          {t('nutrition.goals.calories')}
        </Text>
        {value('calories', true)}
      </View>
      {MACROS.map(({ key, color }) => (
        <View
          key={key}
          style={[styles.row, { paddingVertical: spacing.md }, listDivider(false, colors.border)]}
        >
          <View style={[styles.name, styles.row, { gap: spacing.sm }]}>
            <MacroDot color={color} />
            <Text>{t(`nutrition.macros.${key}`)}</Text>
          </View>
          {value(key, false)}
        </View>
      ))}
    </Card>
  );
}

/** The goals to read. */
function ReadTargets({ targets }: { targets: NutritionTargets }) {
  const { format } = useNumberFormat();
  const grams = { protein: targets.proteinG, carbs: targets.carbsG, fat: targets.fatG };
  return (
    <TargetRows
      value={(field, large) => (
        <Text variant={large ? 'headline' : 'label'} color={large ? 'primaryText' : 'text'}>
          {format(field === 'calories' ? targets.calories : grams[field])}{' '}
          <Text color="textMuted">{large ? 'kcal' : 'g'}</Text>
        </Text>
      )}
    />
  );
}

/** The goals to type in. */
function EditTargets({
  form,
  onChange,
}: {
  form: TargetsForm;
  onChange: (change: Partial<TargetsForm>) => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <TargetRows
      value={(field, large) => {
        // An input's font without its line height, which iOS draws above the middle of the box.
        const font = large ? typography.headline : typography.label;
        return (
          <View style={[styles.value, { gap: spacing.xs }]}>
            <TextInput
              accessibilityLabel={
                field === 'calories'
                  ? t('nutrition.goals.calories')
                  : t(`nutrition.macros.${field}`)
              }
              value={form[field]}
              onChangeText={(text) => onChange({ [field]: text })}
              keyboardType="number-pad"
              selectTextOnFocus
              maxLength={4}
              style={[
                styles.input,
                {
                  fontFamily: font.fontFamily,
                  fontSize: font.fontSize,
                  color: large ? colors.primaryText : colors.text,
                  borderBottomColor: colors.border,
                  minWidth: large ? 88 : 56,
                },
              ]}
            />
            <Text color="textMuted">{large ? 'kcal' : 'g'}</Text>
          </View>
        );
      }}
    />
  );
}

/** What the calculated goals are worked out from, as a list. */
function BasisList({ basis }: { basis: TargetBasis }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const monthDay = useMonthDayFormat();
  const latest = useLatestWeight();
  const unit = useWeightUnit().data ?? 'kg';
  const current = latest.data?.weightKg ?? null;
  const weight = (kg: number) => format(weightIn(unit, kg));

  const rows: { key: keyof typeof BASIS_ICONS; label: string; value: string; detail: string }[] = [
    {
      key: 'goal',
      label: t('nutrition.goals.goal'),
      value: t(`goals.goal.${basis.goal}`),
      detail: t(`onboarding.goal.effects.${basis.goal}.calories`),
    },
  ];
  if (current !== null) {
    // At or past the target, the targets keep the weight, as calculate_nutrition_targets() does.
    const target = basis.targetWeightKg;
    const reached = target !== null && isTargetReached(basis.goal, current, target);
    rows.push(
      target !== null && !reached
        ? {
            key: 'target',
            label: t('nutrition.goals.weight'),
            value: t('nutrition.goals.weightChange', {
              from: weight(current),
              to: weight(target),
              unit,
            }),
            detail: t('nutrition.goals.toGo', {
              difference: weight(Math.abs(current - target)),
              unit,
            }),
          }
        : {
            key: 'target',
            label: t('nutrition.goals.weight'),
            value: t('nutrition.goals.weightNow', { weight: weight(current), unit }),
            detail: reached ? t('nutrition.goals.reached') : t('nutrition.goals.keeping'),
          },
    );
    if (target !== null && !reached && basis.weeklyPaceKg !== null) {
      rows.push({
        key: 'pace',
        label: t('nutrition.goals.pace'),
        value: t('nutrition.goals.perWeek', {
          value: format(weightIn(unit, basis.weeklyPaceKg)),
          unit,
        }),
        detail: t('nutrition.goals.by', {
          date: monthDay(projectedDate(current, target, basis.weeklyPaceKg, new Date())),
        }),
      });
    }
  }
  rows.push({
    key: 'activity',
    label: t('nutrition.goals.activity'),
    value: t(`goals.activityLevel.${basis.activity}`),
    detail: t(`goals.activityDescriptions.${basis.activity}`),
  });

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" accessibilityRole="header">
        {t('nutrition.goals.workedOutFrom')}
      </Text>
      <Card list>
        {rows.map((row, index) => (
          <View
            key={row.key}
            accessible
            accessibilityLabel={`${row.label}: ${row.value}, ${row.detail}`}
            style={[
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.md },
              listDivider(index === 0, colors.border),
            ]}
          >
            <IconTile
              name={BASIS_ICONS[row.key].icon}
              color={BASIS_ICONS[row.key].color}
              background={BASIS_ICONS[row.key].background}
              size={40}
            />
            <View style={styles.name}>
              <Text variant="label">{row.value}</Text>
              <Text variant="caption" color="textMuted">
                {row.detail}
              </Text>
            </View>
            <Text variant="caption" color="textMuted">
              {row.label}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    flex: 1,
  },
  value: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  input: {
    textAlign: 'right',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 0,
  },
});
