import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { StepButtons } from '@/components/ui/step-buttons';
import { Text } from '@/components/ui/text';
import { toIsoDate, useDateFormat } from '@/i18n/dates';
import { useWeightFormat, type WeightUnit } from '@/i18n/units';
import { clamp } from '@/lib/math';
import { useTheme } from '@/theme';
import { WEIGHT_RANGE_KG } from '@/weight/range';
import { useLogWeight, type WeightEntry } from '@/weight/weights';

/**
 * How much one press changes the weight. It is a tenth of a kilogram in either unit, because the
 * database stores a tenth of a kilogram, so a tenth of a pound would often not change it.
 */
const STEP_KG = 0.1;
/** How long after the last press the weight is saved, so quick presses are saved once. */
export const SAVE_DELAY_MS = 800;

type WeightCardProps = {
  latest: WeightEntry | null;
  unit: WeightUnit;
  today: Date;
};

/**
 * The latest weight, with buttons to change today's weight a tenth of a kilogram at a time. The
 * change is saved shortly after the last press.
 */
export function WeightCard({ latest, unit, today }: WeightCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const formatWeight = useWeightFormat();
  const formatDate = useDateFormat('medium');
  const logWeight = useLogWeight();
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
      // The draft stays until the saved weight has been loaded again, so the value doesn't jump.
      logWeight.mutate(nextKg, { onSettled: () => setDraftKg(null) });
    };
    pending.current = { timer: setTimeout(save, SAVE_DELAY_MS), save };
  };

  return (
    <Card entering={FadeInDown.delay(300).duration(400)}>
      <Text variant="headline">{t('weight.title')}</Text>
      {shownKg === undefined ? (
        <Text color="textMuted">{t('weight.none')}</Text>
      ) : (
        <View style={[styles.row, { gap: spacing.md }]}>
          <View style={styles.latest}>
            <Text variant="title">
              {formatWeight(shownKg, unit)} {unit}
            </Text>
            <Text color="textMuted">
              {loggedToday
                ? t('weight.loggedToday')
                : t('weight.loggedOn', {
                    // A day without a time zone, so it is read as local midnight.
                    date: formatDate(new Date(`${latest?.measuredOn}T00:00`)),
                  })}
            </Text>
          </View>
          <StepButtons
            onDecrease={() => change(-STEP_KG)}
            onIncrease={() => change(STEP_KG)}
            decreaseLabel={t('weight.decrease')}
            increaseLabel={t('weight.increase')}
          />
        </View>
      )}
      {logWeight.isError ? <Text color="danger">{t('weight.saveError')}</Text> : null}
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
});
