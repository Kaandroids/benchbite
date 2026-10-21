import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Slider } from '@/components/ui/slider';
import { Text } from '@/components/ui/text';
import { WheelPicker } from '@/components/ui/wheel-picker';
import { defaultUnits, useNumberFormat, type HeightUnit, type WeightUnit } from '@/i18n/units';
import { useOnboarding } from '@/providers/onboarding-provider';
import { useTheme, type ColorTokens, type TypographyVariant } from '@/theme';

const GOALS = [
  { id: 'lose', icon: 'flame', title: 'Lose fat', description: 'Calorie deficit, higher reps' },
  {
    id: 'muscle',
    icon: 'dumbbell',
    title: 'Build muscle',
    description: '8–12 reps, small surplus',
  },
  { id: 'strength', icon: 'bolt', title: 'Get stronger', description: 'Heavy, 4–6 reps' },
  { id: 'health', icon: 'heart', title: 'Stay healthy', description: 'Balanced training and food' },
] satisfies { id: string; icon: IconName; title: string; description: string }[];

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const WEIGHT_UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
] as const;
const HEIGHT_UNITS = [
  { value: 'cm', label: 'cm' },
  { value: 'ft', label: 'ft / in' },
] as const;
const WHOLE_WEIGHTS = { kg: range(30, 250), lb: range(66, 551) };
const TENTHS = range(0, 9);
const CENTIMETRES = range(120, 230);
const FEET = range(3, 7);
const INCHES = range(0, 11);
const KG_PER_LB = 0.45359237;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const VARIANTS: TypographyVariant[] = [
  'display',
  'title',
  'headline',
  'body',
  'bodyStrong',
  'caption',
  'button',
];
const ICONS: IconName[] = [
  'back',
  'bolt',
  'check',
  'close',
  'dumbbell',
  'flame',
  'heart',
  'offline',
];

/** Every design system component in its states, for development only. */
export default function ComponentGallery() {
  const { colors, spacing } = useTheme();
  const [goal, setGoal] = useState('lose');
  const [days, setDays] = useState(['Monday', 'Wednesday', 'Friday']);
  const [progress, setProgress] = useState(0.3);
  const [loading, setLoading] = useState(false);
  const { reset } = useOnboarding();
  const { format, decimalSeparator } = useNumberFormat();
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(() => defaultUnits().weight);
  // Weight in tenths of the selected unit, so that both wheels read from one number.
  const [weightTenths, setWeightTenths] = useState(() => (weightUnit === 'lb' ? 1598 : 725));
  const [heightUnit, setHeightUnit] = useState<HeightUnit>(() => defaultUnits().height);
  const [centimetres, setCentimetres] = useState(178);
  const [pace, setPace] = useState(0.5);

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  const changeWeightUnit = (unit: WeightUnit) => {
    const factor = unit === 'lb' ? 1 / KG_PER_LB : KG_PER_LB;
    setWeightUnit(unit);
    setWeightTenths((tenths) => Math.round(tenths * factor));
  };
  const wholeWeight = Math.floor(weightTenths / 10);
  const totalInches = Math.round(centimetres / 2.54);
  const setFeetAndInches = (feet: number, inches: number) =>
    setCentimetres(Math.round((feet * 12 + inches) * 2.54));

  const toggleDay = (day: string) =>
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );

  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      footer={
        <Button
          label="Simulate a request"
          loading={loading}
          onPress={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1500);
          }}
        />
      }
    >
      <Text variant="title">Component gallery</Text>

      <Section title="Onboarding">
        <Button
          variant="secondary"
          label="Start the onboarding again"
          onPress={() => {
            reset();
            // Back to the home screen, which is no longer allowed and redirects to the onboarding.
            router.back();
          }}
        />
      </Section>

      <Section title="Progress">
        <View style={[styles.row, { gap: spacing.sm }]}>
          <Button
            variant="secondary"
            label="−10%"
            onPress={() => setProgress((p) => Math.max(0, p - 0.1))}
          />
          <Button
            variant="secondary"
            label="+10%"
            onPress={() => setProgress((p) => Math.min(1, p + 0.1))}
          />
        </View>
      </Section>

      <Section title="Weight">
        <SegmentedControl
          accessibilityLabel="Weight unit"
          options={WEIGHT_UNITS}
          value={weightUnit}
          onChange={changeWeightUnit}
        />
        <View style={[styles.wheels, { gap: spacing.xs }]}>
          <WheelPicker
            key={weightUnit}
            accessibilityLabel="Weight"
            values={WHOLE_WEIGHTS[weightUnit]}
            value={wholeWeight}
            onChange={(whole) => setWeightTenths(whole * 10 + (weightTenths % 10))}
            formatAccessibilityValue={(whole) => `${whole} ${weightUnit}`}
          />
          <WheelPicker
            accessibilityLabel="Weight, tenths"
            values={TENTHS}
            value={weightTenths % 10}
            onChange={(tenth) => setWeightTenths(wholeWeight * 10 + tenth)}
            format={(tenth) => `${decimalSeparator}${tenth}`}
            width={64}
          />
          <Text variant="headline" color="textMuted">
            {weightUnit}
          </Text>
        </View>
        <Text color="textMuted">
          Selected: {format(weightTenths / 10, { minimumFractionDigits: 1 })} {weightUnit}
        </Text>
      </Section>

      <Section title="Height">
        <SegmentedControl
          accessibilityLabel="Height unit"
          options={HEIGHT_UNITS}
          value={heightUnit}
          onChange={setHeightUnit}
        />
        {heightUnit === 'cm' ? (
          <View style={[styles.wheels, { gap: spacing.xs }]}>
            <WheelPicker
              accessibilityLabel="Height"
              values={CENTIMETRES}
              value={centimetres}
              onChange={setCentimetres}
              formatAccessibilityValue={(cm) => `${cm} centimetres`}
            />
            <Text variant="headline" color="textMuted">
              cm
            </Text>
          </View>
        ) : (
          <View style={[styles.wheels, { gap: spacing.xs }]}>
            <WheelPicker
              accessibilityLabel="Height, feet"
              values={FEET}
              value={Math.floor(totalInches / 12)}
              onChange={(feet) => setFeetAndInches(feet, totalInches % 12)}
              format={(feet) => `${feet} ft`}
            />
            <WheelPicker
              accessibilityLabel="Height, inches"
              values={INCHES}
              value={totalInches % 12}
              onChange={(inches) => setFeetAndInches(Math.floor(totalInches / 12), inches)}
              format={(inches) => `${inches} in`}
            />
          </View>
        )}
        <Text color="textMuted">Selected: {centimetres} cm</Text>
      </Section>

      <Section title="Slider">
        <Text variant="bodyStrong">{format(pace, { minimumFractionDigits: 2 })} kg per week</Text>
        <Slider
          accessibilityLabel="Weekly pace"
          value={pace}
          onChange={setPace}
          min={0.25}
          max={1}
          step={0.05}
          formatAccessibilityValue={(kg) => `${kg} kilograms a week`}
          minLabel="Gentle"
          maxLabel="Fast"
        />
      </Section>

      <Section title="Single choice">
        {GOALS.map((item) => (
          <ChoiceCard
            key={item.id}
            icon={item.icon}
            title={item.title}
            description={item.description}
            selected={goal === item.id}
            onPress={() => setGoal(item.id)}
          />
        ))}
      </Section>

      <Section title="Multiple choice">
        {DAYS.map((day) => (
          <ChoiceCard
            key={day}
            type="checkbox"
            title={day}
            selected={days.includes(day)}
            onPress={() => toggleDay(day)}
          />
        ))}
      </Section>

      <Section title="Buttons">
        <Button label="Continue" onPress={() => {}} />
        <Button variant="secondary" label="Skip for now" onPress={() => {}} />
        <Button variant="ghost" label="I already have an account" onPress={() => {}} />
        <Button label="Disabled" disabled />
        <Button label="Loading" loading />
      </Section>

      <Section title="Typography">
        {VARIANTS.map((variant) => (
          <Text key={variant} variant={variant}>
            {variant} · Größe ğüşıöç
          </Text>
        ))}
      </Section>

      <Section title="Icons">
        <View style={[styles.row, { gap: spacing.lg }]}>
          {ICONS.map((name) => (
            <Icon key={name} name={name} color="primary" />
          ))}
        </View>
      </Section>

      <Section title="Colours">
        <View style={[styles.row, { gap: spacing.sm }]}>
          {(Object.keys(colors) as (keyof ColorTokens)[]).map((name) => (
            <View key={name} style={[styles.swatch, { gap: spacing.xs }]}>
              <View
                style={[styles.chip, { backgroundColor: colors[name], borderColor: colors.border }]}
              />
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md, marginTop: spacing.md }}>
      <Text variant="headline">{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  wheels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 96,
  },
  chip: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
});
