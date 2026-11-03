import { router } from 'expo-router';

/** Opens what premium adds, from wherever the plan stops the user (#411). */
export function useOpenPremium() {
  return () => router.push('/premium');
}
