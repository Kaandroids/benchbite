import { router } from 'expo-router';

import { RoundIconButton } from '@/components/ui/round-icon-button';

/** Opens the developer tools, beside the settings; only in development. */
export function DevButton() {
  if (!__DEV__) {
    return null;
  }
  return (
    <RoundIconButton
      icon="code"
      color="text"
      background="surface"
      label="Developer tools"
      onPress={() => router.push('/dev/tools')}
      size={44}
      bordered
    />
  );
}
