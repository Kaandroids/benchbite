import { router } from 'expo-router';

import { AiConsentScreen } from '@/ai/ai-consent-screen';

export default function AiConsentRoute() {
  return <AiConsentScreen onGiven={() => router.back()} onClose={() => router.back()} />;
}
