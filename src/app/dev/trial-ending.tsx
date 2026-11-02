import { Redirect, router } from 'expo-router';

import { addDays } from '@/i18n/dates';
import { SAMPLE_PRICES } from '@/premium/sample-prices';
import { TrialEndingScreen } from '@/premium/trial-ending-screen';

/** The reminder before the trial ends, with sample numbers, to look at in development. */
export default function TrialEndingPreview() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return (
    <TrialEndingScreen
      endsOn={addDays(new Date(), 2)}
      daysLeft={2}
      usage={{ chats: 12, photos: 9, reviews: 1 }}
      prices={SAMPLE_PRICES}
      onKeep={() => router.back()}
      onCancel={() => router.back()}
      onClose={() => router.back()}
    />
  );
}
