import * as SplashScreen from 'expo-splash-screen';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { Button } from '@/components/ui/button';
import { SheetPanel, SheetTitle } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { CaptchaError, setCaptchaHost, type TokenRequest } from './captcha';

/** The page that runs Turnstile, on the website (ADR 0171); a local one can stand in for it. */
export const CAPTCHA_URL =
  process.env.EXPO_PUBLIC_CAPTCHA_URL ?? 'https://www.benchbite.com/captcha/';
/**
 * The widget's key, which is public: the production one in a release build, which only the hosted
 * project accepts, and in development Cloudflare's test key, which always passes unseen, as the
 * local stack checks no captcha (ADR 0171).
 */
export const SITE_KEY =
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ??
  (__DEV__ ? '1x00000000000000000000BB' : '0x4AAAAAAGSIyuXZv1X5V6ht');

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
  const { colors, scheme } = useTheme();
  const web = useRef<ComponentRef<typeof WebView>>(null);
  // The page's state: `ready` gives tokens, and a request that comes while it is `loading` waits
  // for it. One that `failed` is loaded again for the next request, not at once, so that a page
  // that cannot load, as offline, does not load again and again.
  const pageState = useRef<'loading' | 'ready' | 'failed'>('loading');
  const pending = useRef<Pending | null>(null);
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
      pageState.current = 'failed';
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

  const run = () => web.current?.injectJavaScript('window.benchbiteCaptcha(); true;');

  useEffect(() => {
    setCaptchaHost(
      (request) =>
        new Promise<string>((resolve, reject) => {
          const current: Pending = { request, resolve, reject };
          pending.current = current;
          waitUnseen(current);
          if (pageState.current === 'failed') {
            pageState.current = 'loading';
            setPage((count) => count + 1);
          } else if (pageState.current === 'ready') {
            run();
          }
          // Otherwise the page's `ready` runs it.
        }),
    );
    return () => setCaptchaHost(null);
  }, [waitUnseen]);

  const onMessage = ({ nativeEvent }: WebViewMessageEvent) => {
    const message = pageMessage(nativeEvent.data);
    if (!message) return;
    switch (message.type) {
      case 'ready': {
        pageState.current = 'ready';
        // A request that waited, or whose page loaded again, as for a new theme or language,
        // starts over on this page: a check shown on the last one is gone with it.
        const current = pending.current;
        if (current) {
          setInteractive(null);
          waitUnseen(current);
          run();
        }
        break;
      }
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
    // Only a web page, never a call, a message or a link into an app.
    if (url.startsWith('https://')) {
      void Linking.openURL(url).catch(() => {});
    }
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
      {/* Not a Sheet, whose Modal would unmount the WebView, which runs the unseen checks too. */}
      <SheetPanel>
        <SheetTitle>{t('captcha.title')}</SheetTitle>
        <Text color="textMuted">{t('captcha.body')}</Text>
        <WebView
          key={page}
          ref={web}
          source={{ uri: source }}
          originWhitelist={[`${PAGE_ORIGIN}*`, 'https://*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStartLoad}
          setSupportMultipleWindows={false}
          onLoadStart={() => {
            pageState.current = 'loading';
            // A check shown had no timer; the page loading again must still answer in time.
            if (pending.current) waitUnseen(pending.current);
          }}
          onError={() => fail('load')}
          onHttpError={() => fail('http')}
          style={styles.page}
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
      </SheetPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  // Turnstile's widget is 65 points high; the frame leaves room for its border. The WebView's own
  // container grows with `flex: 1`, which in a sheet of no set height would leave it none.
  widget: {
    flex: 0,
    height: 72,
  },
  page: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
