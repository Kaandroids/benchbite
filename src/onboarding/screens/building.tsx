import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { calculateTargets, generatePlan, type NutritionTargets, type WorkoutPlan } from '../plan';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';
import { CenteredContent } from './centered-content';

const STEPS = ['calories', 'exercises', 'week'] as const;
/** Each line of the checklist takes at least this long, so the work is seen being done. */
const STEP_MS = 900;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculates the nutrition targets and builds the workout plan while a checklist fills up, then
 * moves on to the plan. A failure offers to try again.
 */
export function BuildingStep() {
  const { t } = useTranslation();
  const { answers, progress, next, back } = useStep('building');
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

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
        ) : undefined
      }
    >
      <Text variant="title">{t('onboarding.steps.building.title')}</Text>
      {/* A new key starts a fresh attempt. */}
      <BuildingChecklist
        key={attempt}
        answers={answers}
        onDone={(targets, plan) => next({ targets, plan })}
        failed={failed}
        onFail={() => setFailed(true)}
      />
    </Screen>
  );
}

type BuildingChecklistProps = {
  answers: OnboardingAnswers;
  onDone: (targets: NutritionTargets, plan: WorkoutPlan) => void;
  failed: boolean;
  onFail: () => void;
};

function BuildingChecklist({ answers, onDone, failed, onFail }: BuildingChecklistProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [done, setDone] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const work = Promise.all([calculateTargets(answers), generatePlan(answers)]);
    // The checklist advances on its own; the last line waits for the work.
    void (async () => {
      for (let line = 1; line < STEPS.length; line++) {
        await wait(STEP_MS);
        if (cancelled) return;
        setDone(line);
      }
      try {
        const [[targets, plan]] = await Promise.all([work, wait(STEP_MS)]);
        if (cancelled) return;
        setDone(STEPS.length);
        await wait(STEP_MS / 2);
        if (cancelled) return;
        onDone(targets, plan);
      } catch (error) {
        console.warn('Could not build the plan', error);
        if (!cancelled) onFail();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per attempt; a retry mounts a new checklist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CenteredContent>
      <View style={{ gap: spacing.lg }}>
        {STEPS.map((step, index) => {
          const finished = index < done;
          const current = index === done && !failed;
          return (
            <Animated.View
              key={step}
              entering={FadeIn.delay(index * 150)}
              style={[styles.line, { gap: spacing.md }]}
            >
              <View style={styles.marker}>
                {finished ? (
                  <Animated.View
                    entering={ZoomIn}
                    style={[styles.check, { backgroundColor: colors.primary }]}
                  >
                    <Icon name="check" size={16} color="onPrimary" />
                  </Animated.View>
                ) : current ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <View style={[styles.pending, { borderColor: colors.border }]} />
                )}
              </View>
              <Text variant="bodyStrong" color={finished || current ? 'text' : 'textMuted'}>
                {t(`onboarding.building.steps.${step}`)}
              </Text>
            </Animated.View>
          );
        })}
      </View>
      {failed ? (
        <Text color="danger" style={styles.centered}>
          {t('onboarding.building.error')}
        </Text>
      ) : null}
    </CenteredContent>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  marker: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pending: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  centered: {
    textAlign: 'center',
  },
});
