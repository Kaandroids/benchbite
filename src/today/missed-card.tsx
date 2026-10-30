import { useTranslation } from 'react-i18next';

import { Card, type CardProps } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { useSessionSize, useWorkoutName } from '@/workouts/format';
import type { MissedWorkout } from '@/workouts/week-schedule';

import { PlanRow } from './plan-row';

type MissedCardProps = {
  /** This week's missed workouts with the day each was missed on, earliest first; at least one. */
  missed: MissedWorkout[];
  onCatchUp: () => void;
  /** How the card comes in, from the screen that places it. */
  entering?: CardProps['entering'];
};

/**
 * The workouts missed this week in one compact card, however many there are, with one button that
 * opens them to move to a free day or to skip (ADR 0028).
 */
export function MissedCard({ missed, onCatchUp, entering }: MissedCardProps) {
  const { t } = useTranslation();
  const weekdayName = useWeekdayFormat();
  const workoutName = useWorkoutName();
  const sessionSize = useSessionSize();
  const [first] = missed;
  if (!first) {
    return null;
  }

  let caption, title, detail;
  if (missed.length === 1) {
    const { session } = first.workout;
    caption = t('today.missed.missedOn', { day: weekdayName(first.day.weekday) });
    title = workoutName(session);
    detail = sessionSize(session);
  } else {
    caption = t('today.missed.count', { count: missed.length });
    // A workout missed on several days, or a day with several missed, is named once.
    const once = (names: string[]) => [...new Set(names)].join(', ');
    title = once(missed.map(({ workout }) => workoutName(workout.session)));
    detail = once(missed.map(({ day }) => weekdayName(day.weekday)));
  }

  return (
    <Card entering={entering}>
      <PlanRow
        icon="missed"
        color="snack"
        background="snackBackground"
        caption={caption}
        title={title}
        actionIcon="redo"
        actionLabel={t('today.missed.catchUp')}
        onAction={onCatchUp}
      >
        <Text variant="caption" color="textMuted">
          {detail}
        </Text>
      </PlanRow>
    </Card>
  );
}
