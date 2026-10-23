import { useTranslation } from 'react-i18next';

import { MessageView } from '@/components/ui/message-view';

/** Shown for an exercise that is gone, or is not the user's. */
export function ExerciseNotFound() {
  const { t } = useTranslation();
  return (
    <MessageView
      icon="dumbbell"
      title={t('exercise.notFound.title')}
      message={t('exercise.notFound.message')}
    />
  );
}
