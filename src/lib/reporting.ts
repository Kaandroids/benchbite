// Reporting crashes and errors to Sentry (#550, ADR 0149), in its EU region. Only what tells where
// the code failed goes: no user, no device name, no request, and no text that could hold someone's
// data, as a health app's errors may carry weights, meals or what was said to Bite.
import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, ErrorEvent, Exception } from '@sentry/react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import type { ComponentType } from 'react';

/** Whether reporting started, so that the app says it was told only when it was. */
let started = false;

/** Whether errors are reported, as in a release build with a DSN. */
export const isReporting = () => started;

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
  const kept = { type, category, level, timestamp };
  const data = breadcrumb.data ?? {};
  if (type === 'http' || category === 'fetch' || category === 'xhr') {
    return {
      ...kept,
      data: { method: data.method, url: maskUrl(data.url), status_code: data.status_code },
    };
  }
  if (category === 'navigation') {
    return { ...kept, data: { from: maskUrl(data.from), to: maskUrl(data.to) } };
  }
  return kept;
}

/**
 * An event with only what tells where the code failed: its exceptions, masked, with their stack
 * traces, the app's release, the system and the kind of device. The user, the device's name and
 * lasting id, the request, extra data and the breadcrumbs' contents are dropped.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { user: _user, request: _request, extra: _extra, server_name: _server, ...kept } = event;
  const device = kept.contexts?.device;
  const app = kept.contexts?.app;
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
      // A hash that stays the same for a phone, which would tell one person's errors apart.
      ...(app ? { app: { ...app, device_app_hash: undefined } } : {}),
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
    // Sessions carry the installation's id, which nothing on the way removes; the stores count
    // crash-free sessions without it.
    enableAutoSessionTracking: false,
    // For JavaScript events only: the native SDK sends its crashes without them, and the project's
    // server-side rules drop what they hold of the person (ADR 0149).
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
    started = true;
  }
}

/**
 * Wraps the root layout so that reports know the screens and the touches that led to an error. It
 * is no error boundary: what fails while rendering reaches the route's error boundary, which
 * reports it (`reportingErrorBoundary` below).
 */
export const wrapRoot = Sentry.wrap;

/**
 * A route's error screen that also reports what it caught: React hands an error a boundary
 * catches to the boundary, not to the global handler, so it would not be reported otherwise.
 */
export const reportingErrorBoundary = (
  boundary: ComponentType<ErrorBoundaryProps>,
): ComponentType<ErrorBoundaryProps> => Sentry.wrapExpoRouterErrorBoundary(boundary);

/** What a failed request's error says when the phone could not reach the server, or gave up. */
const UNREACHABLE = /network request failed|failed to fetch|network error|timed out|offline/i;

/**
 * Whether an error is one the app expects and handles, and Sentry need not hear of: no network, a
 * request given up, or a refusal the database gives with one of the app's own codes (BB…), which
 * the screen explains to the person.
 */
export function isExpected(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { name, message, code } = error as { name?: unknown; message?: unknown; code?: unknown };
  return (
    name === 'AbortError' ||
    name === 'FunctionsFetchError' ||
    name === 'AuthRetryableFetchError' ||
    // A session that ended, as on another phone: the app asks to log in again.
    name === 'AuthSessionMissingError' ||
    code === 'PGRST301' ||
    (typeof code === 'string' && code.startsWith('BB')) ||
    (typeof message === 'string' && UNREACHABLE.test(message))
  );
}

/**
 * An Error for what was thrown or returned: Supabase answers with plain objects, which Sentry
 * would send as a list of their keys rather than as an error with a message and a code.
 */
function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  const { message, code } = (error ?? {}) as { message?: unknown; code?: unknown };
  const made = new Error(typeof message === 'string' ? message : String(error));
  if (typeof code === 'string') {
    made.name = code;
  }
  return made;
}

/** The errors reported, so that one caught where it happened and by the query client goes once. */
const reported = new WeakSet<object>();

function alreadyReported(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  if (reported.has(error)) {
    return true;
  }
  reported.add(error);
  return false;
}

/**
 * Reports an error the app caught and went on from (#550): in development to the console, as
 * before, and to Sentry when reporting is on, unless it is one the app expects. `where` names what
 * failed in the app's words, such as "Could not save the workout", and groups the reports; it is
 * masked as messages are.
 */
export function reportError(where: string, error: unknown) {
  if (__DEV__) {
    console.warn(where, error);
  }
  if (!started || isExpected(error) || alreadyReported(error)) {
    return;
  }
  // Masked as well, as it can name a stored key, some of which hold the user's id.
  Sentry.captureException(toError(error), { tags: { where: maskText(where) } });
}
