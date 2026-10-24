import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { HistoryButton } from '@/exercises/history-button';
import { InfoButton } from '@/exercises/info-button';
import { thumbnailOf, useExerciseLibrary, findExercise } from '@/exercises/library';
import { useUserId } from '@/providers/session-provider';
import { summarizeSets } from '@/sets/exercise-summary';
import { describeSet, setKindOf } from '@/sets/fields';
import { AddSetButton, SetHeader } from '@/sets/set-table';
import { fonts, useTheme } from '@/theme';
import {
  minutesAndSeconds,
  useRestFormat,
  useTargetFormat,
  useWorkoutName,
} from '@/workouts/format';

import { newRecords } from './records';
import { enableRestAlerts, useNotificationPermission } from './rest-alarm';
import { RestBar } from './rest-bar';
import {
  addSet,
  changeRest,
  clockSeconds,
  isExerciseDone,
  sessionTotals,
  setValues,
  startClock,
  stopClock,
  toggleDone,
  updateSession,
  useActiveSession,
  type SessionExercise,
} from './session';
import { SetRow } from './set-row';
import { useNow } from './use-now';

/** The workout in progress: one exercise open with its sets, the rest folded, and the rest timer. */
export function SessionScreen() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const session = useActiveSession(useUserId());
  const library = useExerciseLibrary();
  const workoutName = useWorkoutName();
  const formatTarget = useTargetFormat();
  const formatRest = useRestFormat();
  const now = useNow(!!session, session?.clock?.startedAt);
  const permission = useNotificationPermission();

  if (!session) {
    return (
      <Screen onBack={() => router.back()}>
        <MessageView
          icon="dumbbell"
          title={t('session.none.title')}
          message={t('session.none.message')}
        />
      </Screen>
    );
  }

  const details = (id: string) => findExercise(library.data, id);
  const totals = sessionTotals(session);
  const elapsed = Math.max(0, Math.floor((now - session.startedAt) / 1000));

  const folded = (exercise: SessionExercise, index: number) => {
    const info = details(exercise.exerciseId);
    const kind = setKindOf(info?.metrics, exercise.target);
    const done = exercise.sets.filter((s) => s.done);
    const finished = isExerciseDone(exercise);
    const { best } = summarizeSets(done, kind);
    return (
      <Pressable
        key={index}
        accessibilityRole="button"
        accessibilityLabel={info?.name}
        onPress={() => updateSession((current) => ({ ...current, current: index }))}
        style={[
          styles.folded,
          {
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radii.lg,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <ExerciseThumbnail path={thumbnailOf(info)} size={48} name={info?.name} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {info?.name ?? ''}
          </Text>
          <Text variant="caption" color="textMuted" style={styles.semibold}>
            {done.length === 0
              ? formatTarget(exercise.sets.length, exercise.target)
              : [
                  t('session.setsDone', { done: done.length, count: exercise.sets.length }),
                  best ? t('session.best', { set: describeSet(best, kind) }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </Text>
        </View>
        <View
          style={[
            styles.mark,
            finished
              ? { backgroundColor: colors.primaryButton }
              : { borderWidth: 2, borderColor: colors.border },
          ]}
        >
          {finished ? <Icon name="check" size={16} color="onPrimary" /> : null}
        </View>
      </Pressable>
    );
  };

  const open = (exercise: SessionExercise, index: number) => {
    const info = details(exercise.exerciseId);
    const kind = setKindOf(info?.metrics, exercise.target);
    const { bySet: records } = newRecords(exercise.sets, kind, exercise.bests);
    return (
      <View
        key={index}
        style={[
          styles.open,
          {
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radii.lg,
            backgroundColor: colors.surface,
            borderColor: colors.primaryButton,
          },
        ]}
      >
        <View style={[styles.row, { gap: spacing.md }]}>
          <ExerciseThumbnail path={thumbnailOf(info)} size={48} name={info?.name} />
          <View style={styles.flex}>
            <Text variant="label">{info?.name ?? ''}</Text>
            <Text variant="captionStrong" color="primaryText">
              {[
                formatTarget(exercise.sets.length, exercise.target),
                formatRest(exercise.restSeconds),
              ].join(' · ')}
            </Text>
          </View>
          <View style={[styles.row, { gap: spacing.sm }]}>
            <HistoryButton exerciseId={exercise.exerciseId} exerciseName={info?.name ?? ''} />
            <InfoButton exerciseId={exercise.exerciseId} exerciseName={info?.name ?? ''} />
          </View>
        </View>

        <SetHeader kind={kind} showLast />

        {exercise.sets.map((set, setIndex) => {
          const running =
            session.clock?.exercise === index && session.clock.set === setIndex
              ? clockSeconds(session.clock, now)
              : null;
          return (
            <SetRow
              key={setIndex}
              number={setIndex + 1}
              set={set}
              kind={kind}
              last={exercise.last[setIndex]}
              clock={running}
              records={records.get(setIndex)}
              onChange={(values) =>
                updateSession((current) => setValues(current, index, setIndex, values))
              }
              onToggle={() => {
                void Haptics.selectionAsync();
                updateSession((current) => toggleDone(current, index, setIndex));
              }}
              onClock={() => {
                void Haptics.selectionAsync();
                updateSession((current) =>
                  running === null ? startClock(current, index, setIndex) : stopClock(current),
                );
              }}
            />
          );
        })}

        <AddSetButton
          count={exercise.sets.length}
          onPress={() => updateSession((current) => addSet(current, index))}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: spacing.md, gap: spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('session.minimize')}
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Icon name="back" color="textMuted" />
        </Pressable>
        <View style={[styles.flex, styles.center]}>
          <Text variant="label" accessibilityRole="header">
            {workoutName(session)}
          </Text>
          <Text variant="captionStrong" color="textMuted" style={[styles.tabular]}>
            {minutesAndSeconds(elapsed)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/session/finish')}
          style={[
            styles.finish,
            { borderRadius: radii.full, backgroundColor: colors.primaryButton },
          ]}
        >
          <Text variant="label" color="onPrimary">
            {t('session.finish')}
          </Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.row,
          { gap: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
        ]}
      >
        <View style={styles.flex}>
          <ProgressBar value={totals.planned ? totals.done / totals.planned : 0} />
        </View>
        <Text variant="captionStrong" color="textMuted">
          {t('session.setsDone', { done: totals.done, count: totals.planned })}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: 140,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {session.exercises.map((exercise, index) =>
          index === session.current ? open(exercise, index) : folded(exercise, index),
        )}
      </ScrollView>

      {session.rest && session.rest.endsAt > now ? (
        <RestBar
          left={Math.ceil((session.rest.endsAt - now) / 1000)}
          total={session.rest.seconds}
          onChange={(seconds) => updateSession((current) => changeRest(current, seconds))}
          onSkip={() => updateSession((current) => ({ ...current, rest: null }))}
          onTurnOnAlerts={
            permission && !permission.granted
              ? () =>
                  void enableRestAlerts({
                    channelName: t('session.restOver.channel'),
                    offTitle: t('session.restAlerts.offTitle'),
                    offMessage: t('session.restAlerts.offMessage'),
                    openSettings: t('session.restAlerts.openSettings'),
                    notNow: t('session.restAlarm.notNow'),
                  }).catch((error: unknown) => console.warn('Could not turn on rest alerts', error))
              : undefined
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
  },
  semibold: {
    fontFamily: fonts.bold,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finish: {
    height: 40,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  folded: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  open: {
    borderWidth: 2,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
