import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
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

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

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
  swatch: {
    width: 96,
  },
  chip: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
});
