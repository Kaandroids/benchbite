import * as SplashScreen from 'expo-splash-screen';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { CaptchaError, setCaptchaHost, type TokenRequest } from './captcha';

/** The page that runs Turnstile, on the website (ADR 0171); a local one can stand in for it. */
export const CAPTCHA_URL =
  process.env.EXPO_PUBLIC_CAPTCHA_URL ?? 'https://www.benchbite.com/captcha/';
/** Cloudflare's test key, which always passes unseen, unless the build names the real one. */
export const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000BB';

/** How long the page has to load, and an unseen check to give a token. */
const WAIT_MS = 20_000;
/** The page's own origin, as a local one in development may be served over plain http. */
const PAGE_ORIGIN = /^[a-z]+:\/\/[^/]+/i.exec(CAPTCHA_URL)?.[0] ?? 'https://www.benchbite.com';
/** Where Turnstile's own frames come from. */
const CHALLENGES = 'https://challenges.cloudflare.com/';

type PageMessage =
  | { type: 'ready' }
  | { type: 'token'; token: string }
  | { type: 'interactive'; shown: boolean }
  | { type: 'error'; code: string };

type Pending = {
  request: TokenRequest;
  resolve: (token: string) => void;
  reject: (error: CaptchaError) => void;
  timer?: ReturnType<typeof setTimeout>;
};

function pageMessage(data: string): PageMessage | null {
  try {
    const message = JSON.parse(data) as PageMessage;
    return typeof message?.type === 'string' ? message : null;
  } catch {
    return null;
  }
}

/**
 * Runs Cloudflare Turnstile in a WebView over the app, unseen, and gives `captchaToken()` its
 * tokens (#455, ADR 0171). When Turnstile needs the person to tap, it shows as a sheet over
 * everything, the splash screen too, until they have; on a form they may close it instead.
 */
export function CaptchaHost() {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing, scheme } = useTheme();
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const ready = useRef(false);
  const onReady = useRef<(() => void)[]>([]);
  const pending = useRef<Pending | null>(null);
  // A new page after one failed to load or gave no token.
  const [page, setPage] = useState(0);
  const [interactive, setInteractive] = useState<TokenRequest | null>(null);

  const settle = useCallback((outcome: { token: string } | { error: CaptchaError }) => {
    const current = pending.current;
    if (!current) return;
    clearTimeout(current.timer);
    pending.current = null;
    setInteractive(null);
    if ('token' in outcome) {
      current.resolve(outcome.token);
    } else {
      current.reject(outcome.error);
    }
  }, []);

  const fail = useCallback(
    (detail: string) => {
      ready.current = false;
      setPage((count) => count + 1);
      settle({ error: new CaptchaError('failed', detail) });
    },
    [settle],
  );

  const waitUnseen = useCallback(
    (current: Pending) => {
      clearTimeout(current.timer);
      current.timer = setTimeout(() => fail('timeout'), WAIT_MS);
    },
    [fail],
  );

  useEffect(() => {
    setCaptchaHost(
      (request) =>
        new Promise<string>((resolve, reject) => {
          const current: Pending = { request, resolve, reject };
          pending.current = current;
          waitUnseen(current);
          const run = () => web.current?.injectJavaScript('window.benchbiteCaptcha(); true;');
          if (ready.current) {
            run();
          } else {
            onReady.current.push(run);
          }
        }),
    );
    return () => setCaptchaHost(null);
  }, [waitUnseen]);

  const onMessage = ({ nativeEvent }: WebViewMessageEvent) => {
    const message = pageMessage(nativeEvent.data);
    if (!message) return;
    switch (message.type) {
      case 'ready':
        ready.current = true;
        onReady.current.forEach((run) => run());
        onReady.current = [];
        break;
      case 'token':
        settle({ token: message.token });
        break;
      case 'error':
        fail(message.code);
        break;
      case 'interactive': {
        const current = pending.current;
        if (!current) break;
        if (message.shown) {
          // The person may take their time; Turnstile ends a check left too long itself.
          clearTimeout(current.timer);
          // At first launch the splash screen would hide the sheet.
          SplashScreen.hide();
          setInteractive(current.request);
        } else {
          setInteractive(null);
          waitUnseen(current);
        }
        break;
      }
    }
  };

  // The page and Turnstile's frames load in the WebView; a link of theirs, as to Cloudflare's
  // privacy policy, opens in the browser.
  const onShouldStartLoad = ({ url, isTopFrame }: ShouldStartLoadRequest) => {
    if (url.startsWith(CAPTCHA_URL) || url.startsWith(CHALLENGES) || url === 'about:blank') {
      return true;
    }
    if (isTopFrame === false) return true;
    void Linking.openURL(url).catch(() => {});
    return false;
  };

  const shown = interactive !== null;
  const source = `${CAPTCHA_URL}?${new URLSearchParams({
    sitekey: SITE_KEY,
    theme: scheme,
    lang: i18n.language,
  }).toString()}`;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root, { opacity: shown ? 1 : 0 }]}
      pointerEvents={shown ? 'auto' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      accessibilityViewIsModal={shown}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      <SafeAreaView
        edges={['bottom']}
        style={{
          backgroundColor: colors.background,
          borderTopLeftRadius: radii.xl,
          borderTopRightRadius: radii.xl,
          padding: spacing.xl,
          gap: spacing.md,
        }}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        <Text variant="headline" accessibilityRole="header">
          {t('captcha.title')}
        </Text>
        <Text color="textMuted">{t('captcha.body')}</Text>
        <WebView
          key={page}
          ref={web}
          source={{ uri: source }}
          originWhitelist={[`${PAGE_ORIGIN}*`, 'https://*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStartLoad}
          setSupportMultipleWindows={false}
          onError={() => fail('load')}
          onHttpError={() => fail('http')}
          style={styles.widget}
          containerStyle={styles.widget}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
        />
        {interactive?.cancellable ? (
          <Button
            label={t('captcha.cancel')}
            variant="ghost"
            onPress={() => settle({ error: new CaptchaError('cancelled') })}
          />
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  // Turnstile's widget is 65 points high; the frame leaves room for its border.
  widget: {
    height: 72,
    backgroundColor: 'transparent',
  },
});
