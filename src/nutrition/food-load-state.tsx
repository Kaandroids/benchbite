import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { LoadState } from '@/components/load-state';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';

type Query = Parameters<typeof LoadState>[0]['queries'][number];

/**
 * A screen about one food while it loads, or when it is gone: taken out of the library, or a food
 * of one's own deleted.
 */
export function FoodLoadState({
  gone,
  queries,
  onBack = () => router.back(),
}: {
  gone: boolean;
  queries: Query[];
  /** What the back arrow does, when the screen shows in a sheet of its own. */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Screen onBack={onBack}>
      {gone ? (
        <MessageView
          icon="meal"
          title={t('nutrition.foodNotFound.title')}
          message={t('nutrition.foodNotFound.message')}
        />
      ) : (
        <LoadState queries={queries} />
      )}
    </Screen>
  );
}
