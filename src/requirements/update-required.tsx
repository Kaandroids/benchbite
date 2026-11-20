import { applicationId, nativeApplicationVersion } from 'expo-application';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, View } from 'react-native';

import { BiteMessage } from '@/components/bite-message';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { reportError } from '@/lib/reporting';
import { useTheme } from '@/theme';

/**
 * The app's page in its store: the address the app's config names, else the store's own way to a
 * package on Android and the App Store's front on iOS, which has no address without the app's id.
 */
export function storeUrl(): string {
  const config = Constants.expoConfig;
  if (Platform.OS === 'android') {
    return config?.android?.playStoreUrl ?? `market://details?id=${applicationId ?? ''}`;
  }
  return config?.ios?.appStoreUrl ?? 'https://apps.apple.com/';
}

/** Google Play's page of the app on the web, for a device without the Play Store app. */
const playWebUrl = () => `https://play.google.com/store/apps/details?id=${applicationId ?? ''}`;

/**
 * In place of the whole app when its version is no longer supported (#687, ADR 0156): what to
 * do, and the way to the store. There is no way past it; the app checks again each time it comes
 * back, so the screen goes once a supported version is installed, or the server says this one is
 * supported after all.
 */
export function UpdateRequired() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const store = Platform.OS === 'android' ? 'android' : 'ios';

  const openStore = () => {
    const url = storeUrl();
    Linking.openURL(url)
      // Nothing takes a market: address on a device without the Play Store; its page on the web
      // still opens there.
      .catch((error: unknown) => {
        if (!url.startsWith('market:')) throw error;
        return Linking.openURL(playWebUrl());
      })
      .catch((error: unknown) => reportError('Could not open the store', error));
  };

  return (
    <Screen
      footer={
        <View style={{ gap: spacing.md }}>
          <Button label={t(`updateRequired.update.${store}`)} onPress={openStore} />
          {nativeApplicationVersion ? (
            <Text variant="caption" color="textMuted" align="center">
              {t('updateRequired.version', { version: nativeApplicationVersion })}
            </Text>
          ) : null}
        </View>
      }
      scrolls={false}
    >
      <BiteMessage
        expression="neutral"
        title={t('updateRequired.title')}
        message={t('updateRequired.body')}
      />
    </Screen>
  );
}
