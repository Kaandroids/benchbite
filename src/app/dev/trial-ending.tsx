import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { addDays, toIsoDate } from '@/i18n/dates';
import { useDisplayName } from '@/profile/display-name';
import { SAMPLE_PRICES } from '@/premium/sample-prices';
import { TrialEndingScreen } from '@/premium/trial-ending-screen';

/** The reminder before the trial ends, on its fifth day with sample numbers, in development. */
export default function TrialEndingPreview() {
  const [startedOn] = useState(() => addDays(new Date(), -4));
  const name = useDisplayName().data;
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return (
    <TrialEndingScreen
      name={name}
      startedOn={startedOn}
      todayIndex={4}
      usedOn={[0, 1, 3, 4].map((day) => toIsoDate(addDays(startedOn, day)))}
      usage={{ chats: 12, photos: 9, reviews: 1 }}
      prices={SAMPLE_PRICES}
      onKeep={() => router.back()}
      onCancel={() => router.back()}
      onClose={() => router.back()}
    />
  );
}
