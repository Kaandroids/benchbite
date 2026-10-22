import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { toIsoDate, useDateFormat } from '@/i18n/dates';
import { useWeightFormat, type WeightUnit } from '@/i18n/units';
import { useTheme } from '@/theme';
import { useLogWeight, type WeightEntry } from '@/weight/weights';
import { WeightWheels } from '@/weight/weight-wheels';

/** Where the wheels start before the first weight is logged. */
const DEFAULT_WEIGHT_KG = 70;

type WeightCardProps = {
  latest: WeightEntry | null;
  unit: WeightUnit;
  today: Date;
};

/** The latest weight and a way to log today's, on wheels that open in the card. */
export function WeightCard({ latest, unit, today }: WeightCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const formatWeight = useWeightFormat();
  const formatDate = useDateFormat('medium');
  const logWeight = useLogWeight();
  const [draftKg, setDraftKg] = useState<number | null>(null);

  const loggedToday = latest?.measuredOn === toIsoDate(today);

  const save = (kg: number) =>
    logWeight.mutate(kg, {
      onSuccess: () => {
        setDraftKg(null);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
    });

  return (
    <Card entering={FadeInDown.delay(300).duration(400)}>
      <Text variant="headline">{t('today.weight.title')}</Text>
      {latest ? (
        <View style={styles.latest}>
          <Text variant="title">
            {formatWeight(latest.weightKg, unit)} {unit}
          </Text>
          <Text color="textMuted">
            {loggedToday
              ? t('today.weight.loggedToday')
              : t('today.weight.loggedOn', {
                  // A day without a time zone, so it is read as local midnight.
                  date: formatDate(new Date(`${latest.measuredOn}T00:00`)),
                })}
          </Text>
        </View>
      ) : (
        <Text color="textMuted">{t('today.weight.none')}</Text>
      )}

      {draftKg === null ? (
        <Button
          variant="secondary"
          label={loggedToday ? t('today.weight.correct') : t('today.weight.log')}
          onPress={() => {
            logWeight.reset();
            setDraftKg(latest?.weightKg ?? DEFAULT_WEIGHT_KG);
          }}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <WeightWheels
            kg={draftKg}
            unit={unit}
            onChange={setDraftKg}
            accessibilityLabel={t('today.weight.title')}
          />
          {logWeight.isError ? (
            <Text color="danger" align="center">
              {t('today.weight.saveError')}
            </Text>
          ) : null}
          <View style={[styles.actions, { gap: spacing.sm }]}>
            <Button
              variant="ghost"
              label={t('today.weight.cancel')}
              onPress={() => setDraftKg(null)}
              style={styles.action}
            />
            <Button
              label={t('today.weight.save')}
              loading={logWeight.isPending}
              onPress={() => save(draftKg)}
              style={styles.action}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  latest: {
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
  },
  action: {
    flex: 1,
  },
});
