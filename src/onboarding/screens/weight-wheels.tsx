import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { WheelPicker } from '@/components/ui/wheel-picker';
import { useNumberFormat, weightIn, weightToKg, type WeightUnit } from '@/i18n/units';
import { clamp, range } from '@/lib/math';
import { useTheme } from '@/theme';

import { WEIGHT_RANGE_KG } from '../body';

const TENTHS = range(0, 9);
const WHOLE = {
  kg: range(WEIGHT_RANGE_KG.min, WEIGHT_RANGE_KG.max),
  lb: range(
    Math.ceil(weightIn('lb', WEIGHT_RANGE_KG.min)),
    Math.floor(weightIn('lb', WEIGHT_RANGE_KG.max)),
  ),
};

type WeightWheelsProps = {
  kg: number;
  unit: WeightUnit;
  onChange: (kg: number) => void;
  accessibilityLabel: string;
};

/**
 * A weight in the user's unit on two wheels, whole numbers and tenths. The value stays in
 * kilograms, within the range the database accepts.
 */
export function WeightWheels({ kg, unit, onChange, accessibilityLabel }: WeightWheelsProps) {
  const { spacing } = useTheme();
  const { decimalSeparator } = useNumberFormat();
  const value = weightIn(unit, kg);
  const whole = Math.floor(value);
  const tenth = Math.round((value - whole) * 10) % 10;

  const change = (newWhole: number, newTenth: number) => {
    const next = weightToKg(unit, newWhole + newTenth / 10);
    onChange(clamp(next, WEIGHT_RANGE_KG.min, WEIGHT_RANGE_KG.max));
  };

  return (
    <View style={[styles.row, { gap: spacing.xs }]}>
      <WheelPicker
        key={unit}
        accessibilityLabel={accessibilityLabel}
        values={WHOLE[unit]}
        value={whole}
        onChange={(newWhole) => change(newWhole, tenth)}
        formatAccessibilityValue={(newWhole) => `${newWhole}${decimalSeparator}${tenth} ${unit}`}
      />
      <WheelPicker
        accessibilityLabel={accessibilityLabel}
        values={TENTHS}
        value={tenth}
        onChange={(newTenth) => change(whole, newTenth)}
        format={(newTenth) => `${decimalSeparator}${newTenth}`}
        formatAccessibilityValue={(newTenth) => `${whole}${decimalSeparator}${newTenth} ${unit}`}
        width={88}
      />
      <Text variant="headline" color="textMuted">
        {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
