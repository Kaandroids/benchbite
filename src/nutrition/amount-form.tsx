import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { KeyboardAvoiding } from '@/components/ui/keyboard-avoiding';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Screen } from '@/components/ui/screen';
import { MAX_FONT_SCALE, Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { clamp, parseDecimal } from '@/lib/math';
import { typography, useTheme } from '@/theme';

import { amountOf, DEFAULT_GRAMS, type Amount, type Portion } from './foods';
import { MacroDot } from './macro-dot';
import { MACROS } from './macro-targets';
import type { Totals } from './meals';
import { usePortionLabel } from './portion-label';

/** Portions go up and down in halves; grams in tens, up to what an entry may hold. */
const PORTION_STEP = 0.5;
const MAX_PORTIONS = 20;
const GRAMS_STEP = 10;
const MAX_GRAMS = 5000;

/** Typed grams as an entry keeps them, to one decimal; null unless above 0 and up to the most. */
function typedGrams(text: string): number | null {
  const value = parseDecimal(text);
  if (value === null) {
    return null;
  }
  const grams = Math.round(value * 10) / 10;
  return grams > 0 && grams <= MAX_GRAMS ? grams : null;
}

type AmountFormProps = {
  /** The food's name, in the top bar. */
  title: string;
  /** Under the title, such as the calories per 100 g. */
  subtitle: string;
  /** At the end of the top bar, such as Edit. */
  action?: ReactNode;
  /** What the back arrow does; it goes back a screen unless the form shows in a sheet of its own. */
  onBack?: () => void;
  per100g: Totals;
  /** The food's portions, the default first; none leaves grams only. */
  portions: Portion[];
  /** The amount to start from, such as an entry's; else one default portion. */
  initial?: Amount;
  /** What the day has without this amount. */
  eatenCalories: number;
  targetCalories: number | null;
  /** A line under what the amount adds, such as what an entry held before. */
  note?: string;
  submitLabel: string;
  submitting: boolean;
  /** Why the last submit failed, if it did. */
  error?: ReactNode;
  onSubmit: (amount: Amount) => void;
  /** Under the form, such as a button that removes an entry. */
  children?: ReactNode;
};

/** The index of the portion an amount was picked in, or null for grams. */
function portionIndexOf(portions: Portion[], initial?: Amount): number | null {
  if (!initial) {
    return portions.length > 0 ? 0 : null;
  }
  const index = portions.findIndex((portion) => portion.unit === initial.portion?.unit);
  return index === -1 ? null : index;
}

/**
 * Picks an amount of a food in portions or grams, and shows what it adds and what the day would
 * come to. Used to add a food and to change an entry.
 */
export function AmountForm({
  title,
  subtitle,
  action,
  onBack = () => router.back(),
  per100g,
  portions,
  initial,
  eatenCalories,
  targetCalories,
  note,
  submitLabel,
  submitting,
  error,
  onSubmit,
  children,
}: AmountFormProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { fontScale } = useWindowDimensions();
  const { format } = useNumberFormat();
  const portionLabel = usePortionLabel();
  const [portionIndex, setPortionIndex] = useState(() => portionIndexOf(portions, initial));
  const [count, setCount] = useState(portionIndex !== null ? (initial?.portion?.count ?? 1) : 1);
  const [grams, setGrams] = useState(initial?.grams ?? portions[0]?.grams ?? DEFAULT_GRAMS);
  const [gramsText, setGramsText] = useState<string | null>(null);

  const portion = portionIndex === null ? null : portions[portionIndex]!;
  // As many portions as an entry's grams allow, such as 6.5 bottles of 750 g.
  const maxCount = portion
    ? Math.min(MAX_PORTIONS, Math.floor(MAX_GRAMS / portion.grams / PORTION_STEP) * PORTION_STEP)
    : 0;
  // Entries keep grams to one decimal.
  const amount = portion ? Math.round(portion.grams * count * 10) / 10 : grams;
  const adds = amountOf(per100g, amount);

  const step = (direction: 1 | -1) => {
    if (portion) {
      setCount((current) => clamp(current + direction * PORTION_STEP, PORTION_STEP, maxCount));
    } else {
      setGramsText(null);
      setGrams((current) =>
        clamp(
          Math.round((current + direction * GRAMS_STEP) / GRAMS_STEP) * GRAMS_STEP,
          1,
          MAX_GRAMS,
        ),
      );
    }
  };
  // Typed grams that are no amount, such as an empty field or more than an entry holds.
  const invalidGrams = !portion && gramsText !== null && typedGrams(gramsText) === null;
  const atMin = portion ? count <= PORTION_STEP : grams <= 1;
  const atMax = portion ? count >= maxCount : grams >= MAX_GRAMS;

  const submit = () =>
    onSubmit({ grams: amount, portion: portion ? { unit: portion.unit, count } : null });

  return (
    <KeyboardAvoiding>
      <Screen
        onBack={onBack}
        title={title}
        subtitle={subtitle}
        action={action}
        footer={
          <Button
            label={submitLabel}
            loading={submitting}
            disabled={invalidGrams}
            onPress={submit}
          />
        }
      >
        <View style={{ gap: spacing.sm }}>
          <Text variant="captionStrong" color="textMuted">
            {t('nutrition.amount.portion')}
          </Text>
          <View style={[styles.chips, { gap: spacing.sm }]}>
            {portions.map((option, index) => (
              <Chip
                key={option.unit}
                label={t('nutrition.amount.portionChip', {
                  portion: portionLabel(option.unit, 1),
                  grams: format(option.grams),
                })}
                selected={portionIndex === index}
                onPress={() => {
                  setPortionIndex(index);
                  setCount(1);
                }}
              />
            ))}
            <Chip
              label={t('nutrition.amount.grams')}
              selected={portionIndex === null}
              onPress={() => {
                setPortionIndex(null);
                setGrams(clamp(amount, 1, MAX_GRAMS));
                setGramsText(null);
              }}
            />
          </View>
        </View>

        <Card style={[styles.stepper, { gap: spacing.md }]}>
          <RoundIconButton
            icon="minus"
            color="text"
            background="track"
            size={48}
            label={t('nutrition.amount.less')}
            onPress={() => step(-1)}
            disabled={atMin}
          />
          <View style={styles.amount}>
            {portion ? (
              <>
                <Text variant="display" align="center">
                  {format(count)}
                </Text>
                <Text variant="caption" color="textMuted" align="center">
                  {portionLabel(portion.unit, count)} ·{' '}
                  {t('nutrition.amount.inGrams', { grams: format(amount) })}
                </Text>
              </>
            ) : (
              <>
                <TextInput
                  accessibilityLabel={t('nutrition.amount.grams')}
                  value={gramsText ?? String(grams)}
                  onChangeText={(text) => {
                    setGramsText(text);
                    const value = typedGrams(text);
                    if (value !== null) {
                      setGrams(value);
                    }
                  }}
                  // Text that is no amount stays, so that Add stays off until it is fixed.
                  onEndEditing={() => {
                    if (gramsText !== null && typedGrams(gramsText) !== null) {
                      setGramsText(null);
                    }
                  }}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  maxLength={6}
                  // Grows with the system font as far as the portion count does.
                  maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
                  style={[
                    styles.gramsInput,
                    {
                      // The display type without its line height: iOS draws the text of an input
                      // with one above the middle of its box, so the number sat high and moved
                      // while it was edited.
                      fontFamily: typography.display.fontFamily,
                      fontSize: typography.display.fontSize,
                      // The height of the portion count, so that switching between them does not
                      // move the card.
                      height:
                        typography.display.lineHeight * Math.min(fontScale, DISPLAY_FONT_SCALE),
                      color: colors.text,
                      borderBottomColor: colors.border,
                    },
                  ]}
                />
                {/* Below the number, as the portion's words are, rather than beside it. */}
                <Text variant="caption" color="textMuted" align="center">
                  {t('nutrition.amount.gramsUnit')}
                </Text>
              </>
            )}
          </View>
          <RoundIconButton
            icon="plus"
            color="text"
            background="track"
            size={48}
            label={t('nutrition.amount.more')}
            onPress={() => step(1)}
            disabled={atMax}
          />
        </Card>

        <Card>
          <View style={styles.addsLine}>
            <Text variant="bodyStrong" color="textMuted">
              {t('nutrition.amount.adds')}
            </Text>
            <Text variant="headline" color="primaryText">
              {format(Math.round(adds.calories))}{' '}
              <Text variant="bodyStrong" color="textMuted">
                kcal
              </Text>
            </Text>
          </View>
          <View style={[styles.macros, { gap: spacing.sm }]}>
            {MACROS.map(({ key, grams: nutrient, color }) => (
              <View
                key={key}
                style={[
                  styles.macro,
                  {
                    borderRadius: radii.md,
                    backgroundColor: colors.background,
                    padding: spacing.md,
                  },
                ]}
              >
                <View style={[styles.macroName, { gap: spacing.xs }]}>
                  <MacroDot color={color} />
                  <Text variant="caption" color="textMuted">
                    {t(`nutrition.macros.${key}`)}
                  </Text>
                </View>
                <Text variant="label">
                  {t('nutrition.grams', { count: Math.round(adds[nutrient]) })}
                </Text>
              </View>
            ))}
          </View>
          {targetCalories !== null ? (
            <Text variant="caption" color="textMuted">
              {t('nutrition.amount.dayWould', {
                eaten: format(Math.round(eatenCalories + adds.calories)),
                target: format(targetCalories),
              })}
            </Text>
          ) : null}
        </Card>

        {note ? (
          <Text variant="caption" color="textMuted">
            {note}
          </Text>
        ) : null}
        {error}
        {children}
      </Screen>
    </KeyboardAvoiding>
  );
}

/** How far the `display` text of the portion count grows with the system font. */
const DISPLAY_FONT_SCALE = MAX_FONT_SCALE.display ?? 1;

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amount: {
    flex: 1,
    alignItems: 'center',
  },
  gramsInput: {
    minWidth: 80,
    textAlign: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 0,
  },
  addsLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  macros: {
    flexDirection: 'row',
  },
  macro: {
    flex: 1,
    gap: 2,
  },
  macroName: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
