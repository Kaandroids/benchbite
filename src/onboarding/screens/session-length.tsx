import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { useUpperCase } from '@/i18n/case';
import { type ColorTokens, useTheme } from '@/theme';
import type { SessionMinutes } from '@shared/plan/limits';
import type { SessionTime } from '@shared/plan/types';

import { partMinutes, useLengthPreview, type LengthPreview } from '../length-preview';
import { SESSION_MINUTES } from '../training';
import { useStep } from '../use-step';

/** The length chosen until the user picks one: the middle of the range. */
const DEFAULT_MINUTES: SessionMinutes = 45;
const LONGEST = SESSION_MINUTES.at(-1)!;

/** The parts of a workout in order, each with its colour in the strip. */
const PARTS: { key: keyof SessionTime; color: keyof ColorTokens; opacity: number }[] = [
  { key: 'warmUp', color: 'textMuted', opacity: 0.35 },
  { key: 'main', color: 'primary', opacity: 1 },
  { key: 'extras', color: 'primary', opacity: 0.45 },
  { key: 'conditioning', color: 'info', opacity: 1 },
];

/**
 * How long a workout may take, and what the plan builder fits into that length for the user's
 * answers: a strip of the workout's parts to scale, and how many exercises and sets.
 */
export function SessionLengthStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, back, next } = useStep('session-length');
  const [minutes, setMinutes] = useState<SessionMinutes>(answers.sessionMinutes ?? DEFAULT_MINUTES);
  const preview = useLengthPreview(answers, minutes);
  const label = (value: SessionMinutes) =>
    value === LONGEST
      ? t('onboarding.sessionLength.longest')
      : t('onboarding.minutes', { count: value });

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <Button label={t('common.continue')} onPress={() => next({ sessionMinutes: minutes })} />
      }
    >
      <View style={{ gap: spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {t('onboarding.steps.session-length.title')}
        </Text>
        <Text color="textMuted">{t('onboarding.sessionLength.intro')}</Text>
      </View>
      {/* Apart from the title, so the question and its answer do not run together. */}
      <View style={{ marginTop: spacing.sm }}>
        <SegmentedControl
          accessibilityLabel={t('onboarding.sessionLength.choose')}
          options={SESSION_MINUTES.map((value) => ({
            value: String(value),
            label: value === LONGEST ? `${value}+` : String(value),
          }))}
          value={String(minutes)}
          onChange={(value) => setMinutes(Number(value) as SessionMinutes)}
        />
      </View>
      <SummaryCard
        minutes={label(minutes)}
        description={t(`onboarding.sessionLength.descriptions.${minutes}`)}
        preview={preview.data}
      />
      <WorkoutCard preview={preview.data} failed={preview.isError || preview.data === null} />
    </Screen>
  );
}

/** The length large, and beside it how many exercises and sets it holds and how much rest. */
function SummaryCard({
  minutes,
  description,
  preview,
}: {
  minutes: string;
  description: string;
  preview?: LengthPreview | null;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Card style={[styles.row, { gap: spacing.lg }]}>
      <Text variant="hero" style={styles.flex} align="center">
        {minutes}
      </Text>
      <View style={[styles.flex, { gap: spacing.sm }]} accessibilityLiveRegion="polite">
        {preview ? (
          <>
            <Fact
              icon="dumbbell"
              label={t('onboarding.sessionLength.exercises', { count: preview.work.exercises })}
            />
            <Fact
              icon="layers"
              label={t('onboarding.sessionLength.sets', { count: preview.work.sets })}
            />
            <Fact
              icon="timer"
              label={t('onboarding.sessionLength.rest', {
                minutes: Math.round(preview.work.rest / 60),
              })}
            />
          </>
        ) : (
          <Text color="textMuted">{description}</Text>
        )}
      </View>
    </Card>
  );
}

/** One thing a workout holds, with its icon. */
function Fact({ icon, label }: { icon: IconName; label: string }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <Icon name={icon} size={18} color="primary" />
      <Text variant="bodyStrong">{label}</Text>
    </View>
  );
}

/** The workout's parts as a strip to scale, with their minutes; a note when it is not known. */
function WorkoutCard({ preview, failed }: { preview?: LengthPreview | null; failed: boolean }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const upperCase = useUpperCase();
  const parts = preview ? PARTS.filter(({ key }) => preview.time[key] > 0) : [];
  const minutes = preview ? partMinutes(preview.time) : null;
  return (
    <Card style={{ gap: spacing.md }}>
      <Text variant="captionStrong" color="textMuted">
        {upperCase(t('onboarding.sessionLength.workout'))}
      </Text>
      {preview ? (
        <>
          <View style={[styles.strip, { gap: 2, borderRadius: radii.sm }]} accessible={false}>
            {parts.map(({ key, color, opacity }) => (
              <View
                key={key}
                style={{ flex: preview.time[key], backgroundColor: colors[color], opacity }}
              />
            ))}
          </View>
          <View style={{ gap: spacing.sm }}>
            {parts.map(({ key, color, opacity }) => (
              <View key={key} style={[styles.row, { gap: spacing.sm }]}>
                <View style={[styles.swatch, { backgroundColor: colors[color], opacity }]} />
                <Text variant="bodyStrong" style={styles.flex}>
                  {t(`onboarding.sessionLength.${key}`)}
                </Text>
                <Text color="textMuted">{t('onboarding.minutes', { count: minutes![key] })}</Text>
              </View>
            ))}
          </View>
        </>
      ) : failed ? (
        <Text color="textMuted">{t('onboarding.sessionLength.unavailable')}</Text>
      ) : (
        // Room for the strip while the plan builder answers, so nothing moves when it does.
        <View style={[styles.strip, { borderRadius: radii.sm, backgroundColor: colors.track }]} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    height: 24,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  flex: {
    flex: 1,
  },
});
