// Runs the Turnstile widget for the app's WebView and tells the app what happens, as JSON through
// window.ReactNativeWebView (#455, ADR 0171):
// - { type: 'ready' } once the widget can run;
// - { type: 'token', token } for each token, which the app asks for with window.benchbiteCaptcha();
// - { type: 'interactive', shown } when Turnstile needs the person to tap, and once it no longer does;
// - { type: 'error', code } when no token can be had.
// The site key is the production one, held here alone; a development build of the app names one of
// Cloudflare's test keys in the address instead.
'use strict';

const PRODUCTION_KEY = '0x4AAAAAAGSIyuXZv1X5V6ht';
const TEST_KEY = /^[123]x0{20}(AA|BB|AB|FF)$/;

const params = new URLSearchParams(location.search);
const asked = params.get('sitekey') ?? '';
const sitekey = TEST_KEY.test(asked) ? asked : PRODUCTION_KEY;
const theme = ['light', 'dark'].includes(params.get('theme')) ? params.get('theme') : 'auto';
const language = /^[a-z]{2}(-[a-z]{2})?$/i.test(params.get('lang') ?? '')
  ? params.get('lang')
  : 'auto';

function post(message) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

let widget;

window.benchbiteCaptchaLoaded = () => {
  widget = window.turnstile.render('#widget', {
    sitekey,
    theme,
    language,
    appearance: 'interaction-only',
    execution: 'execute',
    'refresh-expired': 'never',
    // The app asks again for a token when one could not be had.
    retry: 'never',
    callback: (token) => post({ type: 'token', token }),
    'error-callback': (code) => post({ type: 'error', code: String(code) }),
    'timeout-callback': () => post({ type: 'error', code: 'timeout' }),
    'before-interactive-callback': () => post({ type: 'interactive', shown: true }),
    'after-interactive-callback': () => post({ type: 'interactive', shown: false }),
  });
  post({ type: 'ready' });
};

// A token is used once, so each request of the app's asks for a new one.
window.benchbiteCaptcha = () => {
  window.turnstile.reset(widget);
  window.turnstile.execute(widget);
};
