import { useTranslation } from 'react-i18next';

import { paceRange, type WeightGoal } from '@/body/body';
import { Slider } from '@/components/ui/slider';
import { useNumberFormat, type WeightUnit } from '@/i18n/units';

type PaceSliderProps = {
  goal: WeightGoal;
  unit: WeightUnit;
  /** The user's weight, which the fastest loss depends on. */
  weightKg: number;
  /** The weekly pace in the unit. */
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
};

/** The weekly paces the goal allows, in the unit, from slower to faster. */
export function PaceSlider({
  goal,
  unit,
  weightKg,
  value,
  onChange,
  accessibilityLabel,
}: PaceSliderProps) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const range = paceRange(unit, goal, weightKg);
  return (
    <Slider
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChange={onChange}
      min={range.min}
      max={range.max}
      step={range.step}
      formatAccessibilityValue={(pace) => t('goals.pace.perWeek', { value: format(pace), unit })}
      minLabel={t('goals.pace.slower')}
      maxLabel={t('goals.pace.faster')}
    />
  );
}
