import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { paceIn, useNumberFormat, useWeightLabel } from '@/i18n/units';
import { useTheme } from '@/theme';

import { useNutritionTargets, useRecalculateTargets, type TargetBasis } from '../targets';
import { answerChanges, wasParam, type AnswerChange } from './answers';
import { leave, type StepProps } from './step';

/** The icon of each changed answer on the review, as on the daily goals. */
const CHANGE_ICONS: Record<AnswerChange['key'], IconName> = {
  goal: 'target',
  target: 'scale',
  pace: 'speed',
  activity: 'person',
};

export function ReviewStep({ answers, basis, unit, progress }: StepProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const weightLabel = useWeightLabel();
  const inUse = useNutritionTargets();
  const recalculate = useRecalculateTargets();
  const changes = answerChanges(basis, answers);
  const was = inUse.data;

  const shown = (key: AnswerChange['key'], value: string | number) => {
    switch (key) {
      case 'goal':
        return t(`onboarding.options.goal.${value as TargetBasis['goal']}`);
      case 'activity':
        return t(`onboarding.options.activityLevel.${value as TargetBasis['activity']}`);
      case 'target':
        return weightLabel(Number(value), unit);
      case 'pace':
        return t('nutrition.goals.perWeek', { value: format(paceIn(unit, Number(value))), unit });
    }
  };

  const calculate = () => {
    if (!was) {
      return;
    }
    recalculate.mutate(answers, {
      onSuccess: () => {
        // The steps close under the page with the new goals, so going back from it leaves.
        router.dismissTo('/nutrition/goals');
        router.push({
          pathname: '/nutrition/recalculate/[step]',
          params: { step: 'done', was: wasParam(was) },
        });
      },
    });
  };

  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      onClose={leave}
      footer={
        <View style={{ gap: spacing.md }}>
          {recalculate.isError ? (
            <FormError>{t('nutrition.recalculate.review.saveError')}</FormError>
          ) : null}
          <Button
            label={t('nutrition.recalculate.review.calculate')}
            loading={recalculate.isPending}
            disabled={changes.length === 0 || !was}
            onPress={calculate}
          />
        </View>
      }
    >
      <StepHeading
        title={t('nutrition.recalculate.review.title')}
        intro={t('nutrition.recalculate.review.intro')}
      />
      {changes.length === 0 ? (
        <Card>
          <Text color="textMuted" align="center">
            {t('nutrition.recalculate.review.none')}
          </Text>
        </Card>
      ) : (
        <>
          <Card list>
            {changes.map((change, index) => {
              const label = t(`nutrition.recalculate.review.labels.${change.key}`);
              const to = shown(change.key, change.to);
              const from = change.from === null ? null : shown(change.key, change.from);
              return (
                <View
                  key={change.key}
                  accessible
                  accessibilityLabel={
                    from === null
                      ? `${label}: ${to}`
                      : t('nutrition.recalculate.review.changed', { label, from, to })
                  }
                  style={[
                    styles.row,
                    { gap: spacing.md, paddingVertical: spacing.md },
                    listDivider(index === 0, colors.border),
                  ]}
                >
                  <IconTile name={CHANGE_ICONS[change.key]} size={40} />
                  <View style={styles.flex}>
                    <Text variant="captionStrong" color="textMuted">
                      {label}
                    </Text>
                    <Text variant="label">
                      {from !== null ? (
                        <>
                          <Text variant="label" color="textMuted" style={styles.was}>
                            {from}
                          </Text>
                          <Text variant="label" color="textMuted">
                            {' → '}
                          </Text>
                        </>
                      ) : null}
                      {to}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
          <Text color="textMuted">{t('nutrition.recalculate.review.plan')}</Text>
        </>
      )}
      {inUse.isError && !was ? <LoadState queries={[inUse]} /> : null}
    </Screen>
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
  was: {
    textDecorationLine: 'line-through',
  },
});
