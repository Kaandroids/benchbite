import { router } from 'expo-router';

import { PremiumScreen } from '@/premium/premium-screen';

export default function PremiumRoute() {
  return <PremiumScreen onClose={() => router.back()} />;
}
