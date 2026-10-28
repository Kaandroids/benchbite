import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { paceIn, useNumberFormat, useWeightLabel } from '@/i18n/units';
import { useTheme } from '@/theme';

import { useNutritionTargets } from '../targets';
import { answerChanges, wasParam, type AnswerChange } from './answers';
import { openSave } from './building-step';
import { leave, type StepProps } from './step';
import { Was } from './was';

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
  const changes = answerChanges(basis, answers);
  const was = inUse.data;

  /** The change's old or new value as text, or null for a target or pace there was none of. */
  const shown = (change: AnswerChange, side: 'from' | 'to'): string | null => {
    switch (change.key) {
      case 'goal':
        return t(`goals.goal.${change[side]}`);
      case 'activity':
        return t(`goals.activityLevel.${change[side]}`);
      case 'target': {
        const kg = change[side];
        return kg === null ? null : weightLabel(kg, unit);
      }
      case 'pace': {
        const kg = change[side];
        return kg === null
          ? null
          : t('nutrition.goals.perWeek', { value: format(paceIn(unit, kg)), unit });
      }
    }
  };

  // Pressed once until the review shows again, so that a double tap opens one save.
  const opening = useRef(false);
  useFocusEffect(
    useCallback(() => {
      opening.current = false;
    }, []),
  );
  const calculate = () => {
    if (!was || opening.current) {
      return;
    }
    opening.current = true;
    openSave(answers, wasParam(was));
  };

  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      onClose={leave}
      footer={
        <Button
          label={t('nutrition.recalculate.review.calculate')}
          disabled={changes.length === 0 || !was}
          onPress={calculate}
        />
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
              const to = shown(change, 'to') ?? '';
              const from = shown(change, 'from');
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
                      {from !== null ? <Was value={from} variant="label" /> : null}
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
});
