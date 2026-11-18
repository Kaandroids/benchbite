// Reporting crashes and errors to Sentry (#550, ADR 0149), in its EU region. Only what tells where
// the code failed goes: no user, no device name, no request, and no text that could hold someone's
// data, as a health app's errors may carry weights, meals or what was said to Bite.
import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, ErrorEvent, Exception } from '@sentry/react-native';

const EMAIL = /[^\s@"'<>()]+@[^\s@"'<>()]+\.[^\s@"'<>()]+/g;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/**
 * A number on its own, as a weight, an amount or an id: all of them, as which matter cannot be
 * told. One within a word stays, as the app's error codes (BB063).
 */
const NUMBER = /\b\d+(?:[.,]\d+)?\b/g;

/**
 * A text with what could be someone's data replaced: addresses, tokens, ids and numbers. What is
 * left is the shape of the message, which is what groups errors and tells where they came from.
 */
export function maskText(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(JWT, '[token]')
    .replace(UUID, '[id]')
    .replace(NUMBER, '[n]');
}

/** A URL without what follows its path, where requests to Supabase carry ids and dates. */
function maskUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') {
    return undefined;
  }
  const end = url.search(/[?#]/);
  return maskText(end === -1 ? url : url.slice(0, end));
}

function scrubException(exception: Exception): Exception {
  return { ...exception, value: exception.value ? maskText(exception.value) : exception.value };
}

/**
 * A breadcrumb with only its kind, level and time, and for a request its method, the path of its
 * URL and its status: what was logged, typed or tapped may hold someone's data.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const { type, category, level, timestamp } = breadcrumb;
  if (type === 'http' || category === 'fetch' || category === 'xhr') {
    const data = breadcrumb.data ?? {};
    return {
      type,
      category,
      level,
      timestamp,
      data: { method: data.method, url: maskUrl(data.url), status_code: data.status_code },
    };
  }
  if (category === 'navigation') {
    const data = breadcrumb.data ?? {};
    return {
      type,
      category,
      level,
      timestamp,
      data: { from: maskUrl(data.from), to: maskUrl(data.to) },
    };
  }
  return { type, category, level, timestamp };
}

/**
 * An event with only what tells where the code failed: its exceptions, masked, with their stack
 * traces, the app's release, the system and the kind of device. The user, the device's name, the
 * request, extra data and the breadcrumbs' contents are dropped.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { user: _user, request: _request, extra: _extra, server_name: _server, ...kept } = event;
  const device = kept.contexts?.device;
  return {
    ...kept,
    message: kept.message ? maskText(kept.message) : kept.message,
    exception: kept.exception && {
      ...kept.exception,
      values: kept.exception.values?.map(scrubException),
    },
    breadcrumbs: kept.breadcrumbs
      ?.map(scrubBreadcrumb)
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null),
    contexts: kept.contexts && {
      ...kept.contexts,
      // "Kaan's iPhone": the name someone gave their phone.
      ...(device ? { device: { ...device, name: undefined } } : {}),
    },
  };
}

/** How reporting is set up: what is sent kept to the least, and nothing without a DSN. */
export function reportingOptions(dsn: string | undefined, development: boolean) {
  if (!dsn) {
    return null;
  }
  return {
    dsn,
    environment: development ? 'development' : 'production',
    // Errors and crashes only (ADR 0149): no tracing, logs, replay or screenshots, which could
    // show what someone logged. Set here as well as by default, so that an SDK update cannot turn
    // them on.
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    enableLogs: false,
    // The JavaScript SDK records the requests already, through beforeBreadcrumb.
    enableNetworkBreadcrumbs: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

/**
 * Starts reporting, before anything else of the app runs. A development build reports only when
 * EXPO_PUBLIC_SENTRY_IN_DEV is 1, to try the setup, under its own environment. Expo writes the
 * variables into the bundle, so they are read here by name.
 */
export function startReporting() {
  if (__DEV__ && process.env.EXPO_PUBLIC_SENTRY_IN_DEV !== '1') {
    return;
  }
  const options = reportingOptions(process.env.EXPO_PUBLIC_SENTRY_DSN, __DEV__);
  if (options) {
    Sentry.init(options);
  }
}
