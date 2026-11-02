import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { SpecialOfferScreen } from '@/premium/special-offer-screen';

/** The special offer, with sample prices and a day to go, to look at in development. */
export default function SpecialOfferPreview() {
  const [endsAt] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000 - 48 * 1000));
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return (
    <SpecialOfferScreen
      percent={40}
      usualPrice="€83.88"
      price="€50.33"
      endsAt={endsAt}
      waiting={{ workouts: 7, alternatives: 4, chats: 23 }}
      onClaim={() => router.back()}
      onClose={() => router.back()}
    />
  );
}
