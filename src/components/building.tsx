import { useCallback, useEffect, useEffectEvent, useState, type ReactNode } from 'react';
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
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** Each line about the work shows at least this long, so the work is seen being done. */
const LINE_MS = 1100;
/** How full the plate starts: half, as the onboarding's training intro leaves it. */
const START_SHARE = 0.5;
/** How far the ring fills while the lines show; the rest fills once the work is done. */
const WORKING_SHARE = 0.9;
const SIZE = 200;
/** The ring around the plate, in the plate's 100-unit box. */
const CENTER = 50;
const RING = { r: 46, width: 4 };
const CIRCUMFERENCE = 2 * Math.PI * RING.r;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type BuildingProps<T> = {
  title: string;
  intro: string;
  /** Shown one after another while the work runs; the last one waits for it. */
  lines: string[];
  /** Shown once the work is done. */
  ready: string;
  /** Shown when the work fails. */
  error: string;
  work: () => Promise<T>;
  onDone: (result: T) => void;
  onFail: () => void;
};

/**
 * Does the work while the plate fills up and the lines show one after another. Once done, the
 * plate is bitten and the ready line shows. Each attempt runs once; a new key starts another.
 */
export function Building<T>({
  title,
  intro,
  lines,
  ready: readyLine,
  error,
  work: start,
  onDone,
  onFail,
}: BuildingProps<T>) {
  const { colors, spacing } = useTheme();
  const count = lines.length;
  const [line, setLine] = useState(0);
  const [failed, setFailed] = useState(false);
  const filled = useSharedValue(START_SHARE);
  const bite = useSharedValue(0);
  const crumbs = useSharedValue(0);
  // Read when the attempt starts and ends, so that changes to them do not start it again.
  const build = useEffectEvent(start);
  const finish = useEffectEvent(onDone);
  const fail = useEffectEvent(onFail);

  useEffect(() => {
    let cancelled = false;
    const work = build();
    // A failure is handled once the last line shows. Until then, nothing waits for the work, so
    // a quick failure would also be reported as an unhandled rejection.
    work.catch(() => {});
    filled.set(
      withTiming(WORKING_SHARE, { duration: count * LINE_MS, easing: Easing.out(Easing.quad) }),
    );
    void (async () => {
      for (let next = 1; next < count; next++) {
        await wait(LINE_MS);
        if (cancelled) return;
        setLine(next);
      }
      try {
        const [result] = await Promise.all([work, wait(LINE_MS)]);
        if (cancelled) return;
        filled.set(withTiming(1, { duration: 400 }));
        await wait(400);
        if (cancelled) return;
        // The plate is bitten as the work is done.
        bite.set(
          withSequence(withTiming(1.08, { duration: 130 }), withTiming(1, { duration: 120 })),
        );
        crumbs.set(withTiming(1, { duration: 650 }));
        setLine(count);
        finish(result);
      } catch (cause) {
        console.warn('Could not finish the work', cause);
        if (!cancelled) {
          setFailed(true);
          fail();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per attempt; a retry mounts a new one. The count and shared values never change.
  }, [count, filled, bite, crumbs]);

  const ready = line === count;
  return (
    <View style={[styles.center, { gap: spacing.xl, paddingTop: spacing.xl }]}>
      <View style={[styles.center, { gap: spacing.xs }]}>
        <Text variant="title" align="center" accessibilityRole="header">
          {title}
        </Text>
        <Text color="textMuted" align="center">
          {intro}
        </Text>
      </View>
      <View style={styles.plate} accessible={false}>
        <Svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`}
          style={StyleSheet.absoluteFill}
        >
          <Circle
            cx={CENTER}
            cy={CENTER}
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
      <Percent filled={filled} />
      {/* Keyed by the line, so each one fades in as the one before fades out. */}
      <View style={styles.lineBox} accessibilityLiveRegion="polite">
        {failed ? (
          <Text color="danger" align="center">
            {error}
          </Text>
        ) : (
          <Animated.View key={line} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)}>
            <Text variant="bodyStrong" color={ready ? 'primaryText' : 'text'} align="center">
              {ready ? readyLine : lines[line]}
            </Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

/** One attempt at the work at a time: its key, how it went, and starting another. */
export function useBuildingAttempt<T>() {
  const [key, setKey] = useState(0);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<{ result: T } | null>(null);
  return {
    /** The key of the attempt's `Building`; a new one starts it again. */
    key,
    failed,
    done,
    working: !failed && done === null,
    onDone: useCallback((result: T) => setDone({ result }), []),
    onFail: useCallback(() => setFailed(true), []),
    retry: () => {
      setFailed(false);
      setKey((count) => count + 1);
    },
  };
}

type BuildingFooterProps<T> = {
  attempt: ReturnType<typeof useBuildingAttempt<T>>;
  /** The button that moves on once the work is done. */
  label: string;
  onPress: (result: T) => void;
};

/** Try again after a failure, or the button that moves on once the work is done. */
export function BuildingFooter<T>({ attempt, label, onPress }: BuildingFooterProps<T>) {
  const { t } = useTranslation();
  const { done } = attempt;
  if (attempt.failed) {
    return <Button label={t('common.tryAgain')} onPress={attempt.retry} />;
  }
  return done ? (
    <Animated.View entering={FadeInDown.duration(400)}>
      <Button label={label} onPress={() => onPress(done.result)} />
    </Animated.View>
  ) : null;
}

/**
 * How far the work is done, as a whole percentage. On its own, so that only this text renders
 * again as the ring fills, not the whole screen.
 */
function Percent({ filled }: { filled: SharedValue<number> }) {
  // Starts where the plate starts, so it never reads 0 % for a moment.
  const [percent, setPercent] = useState(() => Math.round(filled.get() * 100));
  useAnimatedReaction(
    () => Math.round(filled.get() * 100),
    (now, before) => {
      if (now !== before) scheduleOnRN(setPercent, now);
    },
  );
  return <Text variant="display">{`${percent}%`}</Text>;
}

/** The ring around the plate, drawn as far as the work is done. */
function Ring({ filled, color }: { filled: SharedValue<number>; color: string }) {
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - filled.get()),
  }));
  return (
    <AnimatedCircle
      animatedProps={animatedProps}
      cx={CENTER}
      cy={CENTER}
      r={RING.r}
      fill="none"
      stroke={color}
      strokeWidth={RING.width}
      strokeLinecap="round"
      strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
      transform={`rotate(-90 ${CENTER} ${CENTER})`}
    />
  );
}

/** The plate, growing and filling in as the work is done. */
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
