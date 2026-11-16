import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, listDivider } from '@/components/ui/card';
import { StepButtons } from '@/components/ui/step-buttons';
import { Text } from '@/components/ui/text';
import { clamp } from '@/lib/math';
import { useTheme } from '@/theme';

/** A value changed a step at a time: its label, as it is shown, and what its buttons do. */
export type StepperRow = {
  label: string;
  value: string;
  decrease: () => void;
  increase: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
};

/**
 * A row for `value`, which steps by `limits.step` between its limits and is applied with `apply`,
 * shown as `shown`.
 */
export function stepperRow(
  label: string,
  value: number,
  limits: { min: number; max: number; step: number },
  apply: (next: number) => void,
  shown: string = String(value),
): StepperRow {
  return {
    label,
    value: shown,
    decrease: () => apply(clamp(value - limits.step, limits.min, limits.max)),
    increase: () => apply(clamp(value + limits.step, limits.min, limits.max)),
    canDecrease: value > limits.min,
    canIncrease: value < limits.max,
  };
}

/** Values in a card, one row each, with minus and plus buttons beside them. */
export function StepperCard({ rows }: { rows: StepperRow[] }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <Card list>
      {rows.map((item, index) => (
        <View
          key={item.label}
          style={[
            styles.row,
            {
              gap: spacing.md,
              paddingVertical: spacing.sm,
              ...listDivider(index === 0, colors.border),
            },
          ]}
        >
          <Text variant="bodyStrong" style={styles.label}>
            {item.label}
          </Text>
          <Text
            variant="headline"
            style={styles.value}
            accessibilityLabel={`${item.label} ${item.value}`}
          >
            {item.value}
          </Text>
          <StepButtons
            size={44}
            onDecrease={item.decrease}
            onIncrease={item.increase}
            canDecrease={item.canDecrease}
            canIncrease={item.canIncrease}
            decreaseLabel={t('editor.less', { label: item.label })}
            increaseLabel={t('editor.more', { label: item.label })}
          />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    flex: 1,
  },
  value: {
    minWidth: 64,
    textAlign: 'center',
  },
});
