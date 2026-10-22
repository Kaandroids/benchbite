import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { toIsoDate, useDateFormat } from '@/i18n/dates';
import { useWeightFormat, type WeightUnit } from '@/i18n/units';
import { clamp } from '@/lib/math';
import { WEIGHT_RANGE_KG } from '@/onboarding/body';
import { useTheme } from '@/theme';
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
  const { colors, radii, spacing } = useTheme();
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

  // Minus is quieter than plus, so the two read apart at a glance.
  const stepButton = (icon: IconName, label: string, deltaKg: number, quiet: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => change(deltaKg)}
      hitSlop={4}
      style={({ pressed }) => [
        styles.step,
        {
          borderRadius: radii.full,
          backgroundColor: pressed ? colors.border : quiet ? colors.track : colors.iconBackground,
        },
      ]}
    >
      <Icon name={icon} color={quiet ? 'textMuted' : 'primary'} />
    </Pressable>
  );

  return (
    <Card entering={FadeInDown.delay(300).duration(400)}>
      <Text variant="headline">{t('today.weight.title')}</Text>
      {shownKg === undefined ? (
        <Text color="textMuted">{t('today.weight.none')}</Text>
      ) : (
        <View style={[styles.row, { gap: spacing.md }]}>
          <View style={styles.latest}>
            <Text variant="title">
              {formatWeight(shownKg, unit)} {unit}
            </Text>
            <Text color="textMuted">
              {loggedToday
                ? t('today.weight.loggedToday')
                : t('today.weight.loggedOn', {
                    // A day without a time zone, so it is read as local midnight.
                    date: formatDate(new Date(`${latest?.measuredOn}T00:00`)),
                  })}
            </Text>
          </View>
          <View style={[styles.row, { gap: spacing.sm }]}>
            {stepButton('minus', t('today.weight.decrease'), -STEP_KG, true)}
            {stepButton('plus', t('today.weight.increase'), STEP_KG, false)}
          </View>
        </View>
      )}
      {logWeight.isError ? <Text color="danger">{t('today.weight.saveError')}</Text> : null}
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
  step: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
