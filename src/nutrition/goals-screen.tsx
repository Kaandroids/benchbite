import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { Icon, type IconName } from '@/components/ui/icon';
import { KeyboardAvoiding } from '@/components/ui/keyboard-avoiding';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { useMonthDayFormat } from '@/i18n/dates';
import { useNumberFormat, weightIn } from '@/i18n/units';
import { projectedDate } from '@/onboarding/body';
import { typography, useTheme } from '@/theme';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

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
    setMode(next);
    if (next === 'calculated' && own?.inUse) {
      useCalculated.mutate();
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
                disabled={result.kind !== 'valid'}
                onPress={save}
              />
            </View>
          ) : undefined
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
            <TargetsCard targets={calculated} />
            {basis ? <BasisList basis={basis} /> : null}
            <Text variant="caption" color="textMuted">
              {t('nutrition.goals.note')}
            </Text>
            {useCalculated.isError ? <FormError>{t('nutrition.goals.saveError')}</FormError> : null}
          </>
        ) : (
          <>
            <TargetsCard form={form} onChange={(change) => setForm({ ...form, ...change })} />
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
              <Text variant="caption" color="textMuted">
                {t('nutrition.goals.macrosMake', {
                  macros: format(result.macroCalories),
                  calories: format(result.targets.calories),
                })}
              </Text>
            )}
          </>
        )}
      </Screen>
    </KeyboardAvoiding>
  );
}

const FIELDS = [
  { key: 'protein', form: 'protein' },
  { key: 'carbs', form: 'carbs' },
  { key: 'fat', form: 'fat' },
] as const;

/** The calories and macros, to read, or with `form` to type in. */
function TargetsCard(
  props:
    | { targets: NutritionTargets }
    | { form: TargetsForm; onChange: (change: Partial<TargetsForm>) => void },
) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();

  const value = (field: keyof TargetsForm, unit: string, large = false) => {
    // An input's font without its line height, which iOS draws above the middle of the box.
    const font = large ? typography.headline : typography.label;
    if ('targets' in props) {
      const targets = props.targets;
      const number =
        field === 'calories'
          ? targets.calories
          : targets[MACROS.find(({ key }) => key === field)!.grams];
      return (
        <Text
          variant={large ? 'headline' : 'label'}
          color={large ? 'primaryText' : 'text'}
          style={styles.number}
        >
          {format(number)}{' '}
          <Text variant="bodyStrong" color="textMuted">
            {unit}
          </Text>
        </Text>
      );
    }
    return (
      <View style={[styles.value, { gap: spacing.xs }]}>
        <TextInput
          accessibilityLabel={
            field === 'calories' ? t('nutrition.goals.calories') : t(`nutrition.macros.${field}`)
          }
          value={props.form[field]}
          onChangeText={(text) => props.onChange({ [field]: text })}
          keyboardType="number-pad"
          selectTextOnFocus
          maxLength={4}
          style={[
            styles.number,
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
        <Text variant="bodyStrong" color="textMuted">
          {unit}
        </Text>
      </View>
    );
  };

  return (
    <Card list>
      <View style={[styles.row, { paddingVertical: spacing.md }]}>
        <Text variant="label" style={styles.name}>
          {t('nutrition.goals.calories')}
        </Text>
        {value('calories', 'kcal', true)}
      </View>
      {FIELDS.map(({ key, form }) => (
        <View
          key={key}
          style={[styles.row, { paddingVertical: spacing.md }, listDivider(false, colors.border)]}
        >
          <View style={[styles.name, styles.row, { gap: spacing.sm }]}>
            <MacroDot color={MACROS.find((macro) => macro.key === key)!.color} />
            <Text variant="label">{t(`nutrition.macros.${key}`)}</Text>
          </View>
          {value(form, 'g')}
        </View>
      ))}
    </Card>
  );
}

/** What the calculated goals are worked out from, as a list. */
function BasisList({ basis }: { basis: TargetBasis }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const monthDay = useMonthDayFormat();
  const latest = useLatestWeight();
  const unit = useWeightUnit().data ?? 'kg';
  const current = latest.data?.weightKg ?? null;
  const weight = (kg: number) => format(weightIn(unit, kg));

  const rows: { icon: IconName; label: string; value: string; detail: string }[] = [
    {
      icon: 'target',
      label: t('nutrition.goals.goal'),
      value: t(`onboarding.options.goal.${basis.goal}`),
      detail: t(`onboarding.goal.effects.${basis.goal}.calories`),
    },
  ];
  if (current !== null) {
    rows.push(
      basis.targetWeightKg !== null
        ? {
            icon: 'scale',
            label: t('nutrition.goals.weight'),
            value: t('nutrition.goals.weightChange', {
              from: weight(current),
              to: weight(basis.targetWeightKg),
              unit,
            }),
            detail: t('nutrition.goals.toGo', {
              difference: weight(Math.abs(current - basis.targetWeightKg)),
              unit,
            }),
          }
        : {
            icon: 'scale',
            label: t('nutrition.goals.weight'),
            value: t('nutrition.goals.weightNow', { weight: weight(current), unit }),
            detail: t('nutrition.goals.keeping'),
          },
    );
    if (basis.targetWeightKg !== null && basis.weeklyPaceKg !== null) {
      rows.push({
        icon: 'speed',
        label: t('nutrition.goals.pace'),
        value: t('nutrition.goals.perWeek', {
          value: format(weightIn(unit, basis.weeklyPaceKg)),
          unit,
        }),
        detail: t('nutrition.goals.by', {
          date: monthDay(
            projectedDate(current, basis.targetWeightKg, basis.weeklyPaceKg, new Date()),
          ),
        }),
      });
    }
  }
  rows.push({
    icon: 'person',
    label: t('nutrition.goals.activity'),
    value: t(`onboarding.options.activityLevel.${basis.activity}`),
    detail: t(`onboarding.activity.descriptions.${basis.activity}`),
  });

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" accessibilityRole="header">
        {t('nutrition.goals.workedOutFrom')}
      </Text>
      <Card list>
        {rows.map((row, index) => (
          <View
            key={row.label}
            accessible
            accessibilityLabel={`${row.label}: ${row.value}, ${row.detail}`}
            style={[
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.md },
              listDivider(index === 0, colors.border),
            ]}
          >
            <View
              style={[
                styles.tile,
                { borderRadius: radii.md, backgroundColor: colors.iconBackground },
              ]}
            >
              <Icon name={row.icon} size={20} color="primary" />
            </View>
            <View style={styles.name}>
              <Text variant="label">{row.value}</Text>
              <Text variant="caption" color="textMuted">
                {row.detail}
              </Text>
            </View>
            <Text variant="captionStrong" color="textMuted">
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
  number: {
    textAlign: 'right',
  },
  input: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 0,
  },
  tile: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
