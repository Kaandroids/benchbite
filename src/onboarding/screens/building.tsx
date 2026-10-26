import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { BittenPlate } from '@/brand/bitten-plate';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { useWeightFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { calculateTargets, generatePlan, type NutritionTargets, type WorkoutPlan } from '../plan';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

/** Each line about the plan shows at least this long, so the work is seen being done. */
const LINE_MS = 1100;
/** The lines shown while the plan is being built; the last one waits for the work. */
const LINES = 3;
/** How far the ring fills while the lines show; the rest fills once the work is done. */
const WORKING_SHARE = 0.9;
const SIZE = 200;
const RING = { r: 46, width: 4 };
const CIRCUMFERENCE = 2 * Math.PI * RING.r;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Result = { targets: NutritionTargets; plan: WorkoutPlan };

/**
 * Calculates the nutrition targets and builds the workout plan while the plate fills up and lines
 * about the plan show one after another. Once done, the plate is bitten and See my plan moves on.
 * A failure offers to try again.
 */
export function BuildingStep() {
  const { t } = useTranslation();
  const { answers, progress, next, back } = useStep('building');
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        failed ? (
          <Button
            label={t('common.tryAgain')}
            onPress={() => {
              setFailed(false);
              setAttempt((count) => count + 1);
            }}
          />
        ) : result ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <Button label={t('onboarding.building.see')} onPress={() => next(result)} />
          </Animated.View>
        ) : undefined
      }
    >
      {/* A new key starts a fresh attempt. */}
      <Building
        key={attempt}
        answers={answers}
        failed={failed}
        onDone={setResult}
        onFail={() => setFailed(true)}
      />
    </Screen>
  );
}

type BuildingProps = {
  answers: OnboardingAnswers;
  failed: boolean;
  onDone: (result: Result) => void;
  onFail: () => void;
};

function Building({ answers, failed, onDone, onFail }: BuildingProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const lines = usePlanLines(answers);
  const [line, setLine] = useState(0);
  const [percent, setPercent] = useState(0);
  const filled = useSharedValue(0);
  const bite = useSharedValue(0);
  const crumbs = useSharedValue(0);
  // Read when the attempt starts and ends, so that changes to them do not start it again.
  const build = useEffectEvent(() =>
    Promise.all([calculateTargets(answers), generatePlan(answers)]),
  );
  const finish = useEffectEvent(onDone);
  const fail = useEffectEvent(onFail);

  useAnimatedReaction(
    () => Math.round(filled.get() * 100),
    (now, before) => {
      if (now !== before) scheduleOnRN(setPercent, now);
    },
  );

  useEffect(() => {
    let cancelled = false;
    const work = build();
    // A failure is handled once the last line shows. Until then, nothing waits for the work, so
    // a quick failure would also be reported as an unhandled rejection.
    work.catch(() => {});
    filled.set(
      withTiming(WORKING_SHARE, { duration: LINES * LINE_MS, easing: Easing.out(Easing.quad) }),
    );
    void (async () => {
      for (let next = 1; next < LINES; next++) {
        await wait(LINE_MS);
        if (cancelled) return;
        setLine(next);
      }
      try {
        const [[targets, plan]] = await Promise.all([work, wait(LINE_MS)]);
        if (cancelled) return;
        filled.set(withTiming(1, { duration: 400 }));
        await wait(400);
        if (cancelled) return;
        // The plate is bitten as the plan is ready.
        bite.set(
          withSequence(withTiming(1.08, { duration: 130 }), withTiming(1, { duration: 120 })),
        );
        crumbs.set(withTiming(1, { duration: 650 }));
        setLine(LINES);
        finish({ targets, plan });
      } catch (error) {
        console.warn('Could not build the plan', error);
        if (!cancelled) fail();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per attempt; a retry mounts a new one. The shared values never change.
  }, [filled, bite, crumbs]);

  const ready = line === LINES;
  return (
    <View style={[styles.center, { gap: spacing.xl, paddingTop: spacing.xl }]}>
      <View style={[styles.center, { gap: spacing.xs }]}>
        <Text variant="title" align="center" accessibilityRole="header">
          {t('onboarding.steps.building.title')}
        </Text>
        <Text color="textMuted" align="center">
          {answers.displayName
            ? t('onboarding.building.waitNamed', { name: answers.displayName })
            : t('onboarding.building.wait')}
        </Text>
      </View>
      <View style={styles.plate} accessible={false}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
          <Circle
            cx={50}
            cy={50}
            r={RING.r}
            fill="none"
            stroke={colors.track}
            strokeWidth={RING.width}
          />
          <Ring filled={filled} color={colors.primary} />
        </Svg>
        <FillingPlate filled={filled}>
          <BittenPlate
            size={SIZE}
            color={colors.primary}
            background={colors.background}
            bite={bite}
            crumbs={crumbs}
          />
        </FillingPlate>
      </View>
      <Text variant="display">{`${percent}%`}</Text>
      {/* Keyed by the line, so each one fades in as the one before fades out. */}
      <View style={styles.lineBox} accessibilityLiveRegion="polite">
        {failed ? (
          <Text color="danger" align="center">
            {t('onboarding.building.error')}
          </Text>
        ) : (
          <Animated.View key={line} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)}>
            <Text variant="bodyStrong" color={ready ? 'primaryText' : 'text'} align="center">
              {ready ? t('onboarding.building.lines.ready') : lines[line]}
            </Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

/** The lines about the plan, from the user's answers: the calories, the exercises, the week. */
function usePlanLines(answers: OnboardingAnswers): string[] {
  const { t } = useTranslation();
  const weight = useWeightFormat();
  const weekday = useWeekdayFormat('short');
  const unit = answers.weightUnit ?? 'kg';
  const pace = answers.weeklyPaceKg ? `${weight(answers.weeklyPaceKg, unit)} ${unit}` : null;
  const days = answers.trainingDays ?? [];
  return [
    answers.goal === 'lose_fat' && pace
      ? t('onboarding.building.lines.losing', { pace })
      : answers.goal === 'build_muscle' && pace
        ? t('onboarding.building.lines.gaining', { pace })
        : t('onboarding.building.lines.keeping'),
    t(`onboarding.building.lines.exercises.${answers.setup ?? 'gym'}`),
    t('onboarding.building.lines.week', {
      count: days.length,
      days: days.map((day) => weekday(day)).join(', '),
    }),
  ];
}

/** The ring around the plate, drawn as far as the plan is built. */
function Ring({ filled, color }: { filled: SharedValue<number>; color: string }) {
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - filled.get()),
  }));
  return (
    <AnimatedCircle
      animatedProps={animatedProps}
      cx={50}
      cy={50}
      r={RING.r}
      fill="none"
      stroke={color}
      strokeWidth={RING.width}
      strokeLinecap="round"
      strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
      transform="rotate(-90 50 50)"
    />
  );
}

/** The plate, growing and filling in as the plan is built. */
function FillingPlate({ filled, children }: { filled: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({
    opacity: 0.12 + 0.88 * filled.get(),
    transform: [{ scale: 0.6 + 0.4 * filled.get() }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  plate: {
    width: SIZE,
    height: SIZE,
  },
  // One line high, so the lines change in place.
  lineBox: {
    minHeight: 24,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
});
