import { usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

/**
 * While there are changes, leaving the screen, with its close button or the system's back, first
 * asks whether to discard them. Returns the function that leaves without asking, such as after
 * saving: it runs once the screen no longer holds on to the changes.
 */
export function useLeavePrompt(changed: boolean, title: string, message: string) {
  const { t } = useTranslation();
  const [leave, setLeave] = useState<(() => void) | null>(null);
  usePreventRemove(changed && leave === null, ({ repeat }) =>
    Alert.alert(title, message, [
      { text: t('common.keepEditing'), style: 'cancel' },
      {
        text: t('common.discard'),
        style: 'destructive',
        onPress: () => setLeave(() => repeat),
      },
    ]),
  );
  useEffect(() => leave?.(), [leave]);
  return (go: () => void) => setLeave(() => go);
}
