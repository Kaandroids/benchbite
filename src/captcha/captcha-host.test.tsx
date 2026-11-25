import * as SplashScreen from 'expo-splash-screen';
import { Linking } from 'react-native';

import { act, fireEvent, render, screen } from '@/test/render';

import { captchaToken } from './captcha';
import { CAPTCHA_URL, CaptchaHost } from './captcha-host';

// The real bridge, not the stand-in every other test gets.
jest.unmock('./captcha');
jest.mock('expo-splash-screen', () => ({ hide: jest.fn() }));

type WebViewProps = {
  source: { uri: string };
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  onShouldStartLoadWithRequest: (request: { url: string; isTopFrame?: boolean }) => boolean;
  onError: () => void;
  onLoadStart: () => void;
  originWhitelist: string[];
};

const mockInject = jest.fn();
let mockProps: WebViewProps;
let mockMounts = 0;
jest.mock('react-native-webview', () => {
  const { forwardRef, useEffect, useImperativeHandle } =
    jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WebView: forwardRef(function MockWebView(props: WebViewProps, ref) {
      mockProps = props;
      useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
      useEffect(() => {
        mockMounts += 1;
      }, []);
      return <View testID="captcha-web-view" />;
    }),
  };
});

/** The page tells the app something, as Turnstile's widget does. */
const page = (message: object) =>
  act(() => mockProps.onMessage({ nativeEvent: { data: JSON.stringify(message) } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockMounts = 0;
});

async function renderHost() {
  const view = await render(<CaptchaHost />);
  await page({ type: 'ready' });
  return view;
}

it('loads the page with the test key in development, in the app’s theme and language', async () => {
  await renderHost();
  const url = new URL(mockProps.source.uri);
  expect(`${url.origin}${url.pathname}`).toBe(CAPTCHA_URL);
  expect(Object.fromEntries(url.searchParams)).toEqual({
    sitekey: '1x00000000000000000000BB',
    theme: 'light',
    lang: 'en',
  });
});

it('gives a token for each request, unseen', async () => {
  await renderHost();
  const token = captchaToken();
  await act(() => Promise.resolve());
  expect(mockInject).toHaveBeenCalledWith('window.benchbiteCaptcha(); true;');
  await page({ type: 'token', token: 'abc' });
  await expect(token).resolves.toBe('abc');
  expect(screen.queryByText('One moment')).toBeNull();
});

it('waits for the page before it asks', async () => {
  await render(<CaptchaHost />);
  const token = captchaToken();
  await act(() => Promise.resolve());
  expect(mockInject).not.toHaveBeenCalled();
  await page({ type: 'ready' });
  expect(mockInject).toHaveBeenCalledTimes(1);
  await page({ type: 'token', token: 'abc' });
  await expect(token).resolves.toBe('abc');
});

it('shows the check when it needs a tap, which a form may close', async () => {
  await renderHost();
  const token = captchaToken();
  await act(() => Promise.resolve());
  await page({ type: 'interactive', shown: true });
  expect(screen.getByRole('header', { name: 'One moment' })).toBeOnTheScreen();
  expect(SplashScreen.hide).toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await expect(token).rejects.toMatchObject({ reason: 'cancelled' });
  expect(screen.queryByText('One moment')).toBeNull();
});

it('cannot be closed at first launch, and goes on once tapped', async () => {
  await renderHost();
  const token = captchaToken({ cancellable: false });
  await act(() => Promise.resolve());
  await page({ type: 'interactive', shown: true });
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

  await page({ type: 'interactive', shown: false });
  await page({ type: 'token', token: 'abc' });
  await expect(token).resolves.toBe('abc');
});

it('fails when Turnstile cannot give a token, and loads the page again for the next request', async () => {
  await renderHost();
  const token = captchaToken();
  await act(() => Promise.resolve());
  await page({ type: 'error', code: '600010' });
  await expect(token).rejects.toMatchObject({ reason: 'failed' });
  expect(mockMounts).toBe(1);

  const next = captchaToken();
  await act(() => Promise.resolve());
  expect(mockMounts).toBe(2);
  await page({ type: 'ready' });
  expect(mockInject).toHaveBeenCalledTimes(2);
  await page({ type: 'token', token: 'abc' });
  await expect(next).resolves.toBe('abc');
});

it('does not load a page that failed again and again while nothing asks', async () => {
  await render(<CaptchaHost />);
  await act(() => mockProps.onError());
  await act(() => mockProps.onError());
  expect(mockMounts).toBe(1);
});

it('starts a request over when the page loads again, as for a new theme', async () => {
  await renderHost();
  const token = captchaToken({ cancellable: false });
  await act(() => Promise.resolve());
  await page({ type: 'interactive', shown: true });
  expect(screen.getByRole('header', { name: 'One moment' })).toBeOnTheScreen();

  await act(() => mockProps.onLoadStart());
  await page({ type: 'ready' });
  expect(screen.queryByText('One moment')).toBeNull();
  expect(mockInject).toHaveBeenCalledTimes(2);
  await page({ type: 'token', token: 'abc' });
  await expect(token).resolves.toBe('abc');
});

it('fails when a page loading again under a shown check never gets ready', async () => {
  jest.useFakeTimers();
  try {
    await renderHost();
    const token = captchaToken({ cancellable: false });
    const failed = expect(token).rejects.toMatchObject({ reason: 'failed' });
    await act(() => jest.advanceTimersByTimeAsync(0));
    await page({ type: 'interactive', shown: true });
    await act(() => mockProps.onLoadStart());
    await act(() => jest.advanceTimersByTimeAsync(20_000));
    await failed;
  } finally {
    jest.useRealTimers();
  }
});

it('waits for a page loading again before it asks', async () => {
  await renderHost();
  await act(() => mockProps.onLoadStart());
  const token = captchaToken();
  await act(() => Promise.resolve());
  expect(mockInject).not.toHaveBeenCalled();
  await page({ type: 'ready' });
  expect(mockInject).toHaveBeenCalledTimes(1);
  await page({ type: 'token', token: 'abc' });
  await expect(token).resolves.toBe('abc');
});

it('fails when the page does not load', async () => {
  await render(<CaptchaHost />);
  const token = captchaToken();
  await act(() => Promise.resolve());
  await act(() => mockProps.onError());
  await expect(token).rejects.toMatchObject({ reason: 'failed' });
});

it('fails when an unseen check gives no token in time', async () => {
  jest.useFakeTimers();
  try {
    await renderHost();
    const token = captchaToken();
    const failed = expect(token).rejects.toMatchObject({ reason: 'failed' });
    await act(() => jest.advanceTimersByTimeAsync(20_000));
    await failed;
  } finally {
    jest.useRealTimers();
  }
});

it('lets Turnstile’s frames load from about: and blob: addresses, which a real check needs', async () => {
  await renderHost();
  // The WebView's own list would block them before onShouldStartLoad is asked.
  expect(mockProps.originWhitelist).toEqual(['*']);
  const load = mockProps.onShouldStartLoadWithRequest;
  expect(load({ url: 'about:srcdoc', isTopFrame: false })).toBe(true);
  expect(load({ url: 'blob:https://challenges.cloudflare.com/x', isTopFrame: false })).toBe(true);
  expect(load({ url: 'about:srcdoc', isTopFrame: true })).toBe(false);
});

it('opens a link of the widget’s in the browser', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await renderHost();
  const load = mockProps.onShouldStartLoadWithRequest;
  expect(load({ url: `${CAPTCHA_URL}?sitekey=x`, isTopFrame: true })).toBe(true);
  expect(load({ url: 'https://challenges.cloudflare.com/cdn-cgi/x', isTopFrame: false })).toBe(
    true,
  );
  expect(load({ url: 'https://www.cloudflare.com/privacypolicy/', isTopFrame: true })).toBe(false);
  expect(open).toHaveBeenCalledWith('https://www.cloudflare.com/privacypolicy/');
  expect(load({ url: 'tel:+4930123', isTopFrame: true })).toBe(false);
  expect(load({ url: 'benchbite://settings', isTopFrame: true })).toBe(false);
  expect(open).toHaveBeenCalledTimes(1);
});
