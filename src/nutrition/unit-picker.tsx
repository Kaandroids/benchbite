import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';
import { useTheme } from '@/theme';

import type { PortionUnit } from './foods';

const UNITS = Constants.public.Enums.portion_unit;

type UnitPickerProps = {
  title: string;
  message: string;
  value: PortionUnit | null;
  /** Offers no unit too, under this label; without it a unit must be picked. */
  noneLabel?: string;
  onPick: (unit: PortionUnit | null) => void;
};

/** The units a portion or a serving can be counted in, for a sheet. */
export function UnitPicker({ title, message, value, noneLabel, onPick }: UnitPickerProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View>
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
        <Text color="textMuted">{message}</Text>
      </View>
      <View style={[styles.units, { gap: spacing.sm }]}>
        {UNITS.map((unit) => {
          const selected = unit === value;
          return (
            <Pressable
              key={unit}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onPick(unit)}
              style={({ pressed }) => [
                styles.unit,
                {
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.md,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.primaryButton : colors.border,
                  backgroundColor: selected ? colors.selected : colors.surface,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text
                variant={selected ? 'label' : 'bodyStrong'}
                color={selected ? 'primaryText' : 'text'}
              >
                {t(`nutrition.food.units.${unit}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {noneLabel ? <Button label={noneLabel} variant="ghost" onPress={() => onPick(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  units: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  unit: {
    width: '48%',
    minHeight: 48,
    justifyContent: 'center',
  },
});
