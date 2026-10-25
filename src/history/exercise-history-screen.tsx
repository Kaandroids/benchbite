import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { allLoaded, LoadState } from '@/components/load-state';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { findExercise, useExerciseLibrary } from '@/exercises/library';
import { setKindOf } from '@/sets/fields';

import { useExerciseHistory } from './exercise-history';
import { ProgressCard, RecordsCard, SessionList } from './exercise-history-parts';

/** An exercise's records, a chart of its progress, and its sets in the workouts it was done in. */
export function ExerciseHistoryScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const history = useExerciseHistory(id);
  const library = useExerciseLibrary();

  const exercise = findExercise(library.data, id);
  const title = (
    <>
      <Text variant="label" accessibilityRole="header" numberOfLines={1}>
        {exercise?.name ?? ''}
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {t('exerciseHistory.subtitle')}
      </Text>
    </>
  );

  if (!allLoaded([history, library])) {
    return (
      <Screen onBack={() => router.back()}>
        <LoadState queries={[history, library]} />
      </Screen>
    );
  }
  const { records, progress, sessions } = history.data ?? {
    records: [],
    progress: [],
    sessions: [],
  };
  if (sessions.length === 0) {
    return (
      <Screen onBack={() => router.back()} title={title}>
        <MessageView
          icon="trophy"
          title={t('exerciseHistory.empty.title')}
          message={t('exerciseHistory.empty.message')}
        />
      </Screen>
    );
  }

  // An exercise no longer in the library is read from how its sets were logged.
  const sample = sessions[0]?.sets[0];
  const kind = setKindOf(
    exercise?.metrics,
    sample && sample.reps === null
      ? { seconds: sample.seconds, meters: sample.meters }
      : { reps: { min: 1, max: 1 } },
  );
  return (
    <Screen onBack={() => router.back()} title={title}>
      {records.length > 0 ? <RecordsCard records={records} kind={kind} /> : null}
      <ProgressCard progress={progress} kind={kind} />
      <Text variant="label" color="textMuted" style={{ paddingHorizontal: 4 }}>
        {t('exerciseHistory.sessions', { count: progress.length })}
      </Text>
      <SessionList sessions={sessions} records={records} kind={kind} />
    </Screen>
  );
}
