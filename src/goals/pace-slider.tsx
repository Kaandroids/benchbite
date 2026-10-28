import { useTranslation } from 'react-i18next';

import { PACE_RANGES, type WeightGoal } from '@/body/body';
import { Slider } from '@/components/ui/slider';
import { useNumberFormat, type WeightUnit } from '@/i18n/units';

type PaceSliderProps = {
  goal: WeightGoal;
  unit: WeightUnit;
  /** The weekly pace in the unit. */
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
};

/** The weekly paces the goal allows, in the unit, from slower to faster. */
export function PaceSlider({ goal, unit, value, onChange, accessibilityLabel }: PaceSliderProps) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const range = PACE_RANGES[unit][goal];
  return (
    <Slider
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChange={onChange}
      min={range.min}
      max={range.max}
      step={range.step}
      formatAccessibilityValue={(pace) =>
        t('onboarding.pace.perWeek', { value: format(pace), unit })
      }
      minLabel={t('onboarding.pace.slower')}
      maxLabel={t('onboarding.pace.faster')}
    />
  );
}
