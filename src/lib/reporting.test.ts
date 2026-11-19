import * as Sentry from '@sentry/react-native';
import type { ErrorEvent } from '@sentry/react-native';

import {
  isReporting,
  maskText,
  reportingErrorBoundary,
  reportingOptions,
  scrubBreadcrumb,
  scrubEvent,
  startReporting,
} from './reporting';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('maskText', () => {
  it('masks addresses, tokens, ids and numbers, and keeps the shape and the error codes', () => {
    expect(
      maskText(
        'BB063: kaan@example.com logged 72.5 kg for 00000000-0000-0000-0000-00000000000a with eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl',
      ),
    ).toBe('BB063: [email] logged [n] kg for [id] with [token]');
  });
});

describe('scrubBreadcrumb', () => {
  it('keeps of a request its method, the path of its URL and its status', () => {
    expect(
      scrubBreadcrumb({
        type: 'http',
        category: 'fetch',
        level: 'info',
        timestamp: 1,
        data: {
          method: 'GET',
          url: 'https://x.supabase.co/rest/v1/meal_entries?user_id=eq.00000000-0000-0000-0000-00000000000a&day=eq.2026-11-18',
          status_code: 500,
          request_body: '{"grams":200}',
        },
      }),
    ).toEqual({
      type: 'http',
      category: 'fetch',
      level: 'info',
      timestamp: 1,
      data: { method: 'GET', url: 'https://x.supabase.co/rest/v1/meal_entries', status_code: 500 },
    });
  });

  it('drops what was logged or tapped', () => {
    expect(
      scrubBreadcrumb({
        category: 'console',
        level: 'warning',
        timestamp: 2,
        message: 'Saving 72.5 kg failed',
        data: { arguments: ['Saving 72.5 kg failed'] },
      }),
    ).toEqual({ category: 'console', level: 'warning', timestamp: 2 });
    expect(
      scrubBreadcrumb({
        category: 'touch',
        timestamp: 3,
        message: 'Lentil soup',
        data: { path: [] },
      }),
    ).toEqual({ category: 'touch', timestamp: 3 });
  });

  it('keeps of a navigation the paths, without what they carry', () => {
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        timestamp: 4,
        data: { from: '/nutrition/food/42?meal=lunch', to: '/nutrition/search' },
      }),
    ).toEqual({
      category: 'navigation',
      timestamp: 4,
      data: { from: '/nutrition/food/[n]', to: '/nutrition/search' },
    });
  });
});

describe('scrubEvent', () => {
  const event: ErrorEvent = {
    type: undefined,
    message: 'Could not save 72.5 kg',
    exception: {
      values: [
        {
          type: 'Error',
          value: 'insert into weight_entries failed for kaan@example.com',
          stacktrace: { frames: [{ filename: 'app:///index.bundle', lineno: 10, colno: 2 }] },
        },
      ],
    },
    user: { id: '00000000-0000-0000-0000-00000000000a', email: 'kaan@example.com' },
    request: { url: 'https://x.supabase.co/rest/v1/weight_entries', data: '{"weight_kg":72.5}' },
    extra: { weight: 72.5 },
    server_name: "Kaan's iPhone",
    contexts: {
      device: { name: "Kaan's iPhone", model: 'iPhone18,2', family: 'iOS' },
      os: { name: 'iOS', version: '27.0' },
      app: { app_version: '1.0.0', device_app_hash: 'de3d6d1741313aa9a309cbd20b081d47fcbfe4c8' },
    },
    breadcrumbs: [{ category: 'console', message: 'Lentil soup', timestamp: 1 }],
    tags: { 'event.origin': 'javascript' },
  };

  it('sends where the code failed, and none of the user, their device’s name or their data', () => {
    const scrubbed = scrubEvent(event);
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.server_name).toBeUndefined();
    expect(scrubbed.message).toBe('Could not save [n] kg');
    expect(scrubbed.exception?.values?.[0]).toEqual({
      type: 'Error',
      value: 'insert into weight_entries failed for [email]',
      stacktrace: { frames: [{ filename: 'app:///index.bundle', lineno: 10, colno: 2 }] },
    });
    expect(scrubbed.contexts?.device).toEqual({
      name: undefined,
      model: 'iPhone18,2',
      family: 'iOS',
    });
    expect(scrubbed.contexts?.os).toEqual({ name: 'iOS', version: '27.0' });
    expect(scrubbed.contexts?.app).toEqual({ app_version: '1.0.0', device_app_hash: undefined });
    expect(scrubbed.breadcrumbs).toEqual([{ category: 'console', timestamp: 1 }]);
    expect(scrubbed.tags).toEqual({ 'event.origin': 'javascript' });
  });

  it('leaves nothing of the user’s data anywhere in what is sent', () => {
    const sent = JSON.stringify(scrubEvent(event));
    for (const secret of [
      'kaan@example.com',
      '72.5',
      'Lentil soup',
      "Kaan's iPhone",
      '0000000a',
      'de3d6d17',
    ]) {
      expect(sent).not.toContain(secret);
    }
  });
});

describe('reportingOptions', () => {
  it('reports nothing without a DSN', () => {
    expect(reportingOptions(undefined, false)).toBeNull();
  });

  it('keeps what is sent to the least, scrubbed, and names the environment', () => {
    expect(reportingOptions('https://key@o1.ingest.de.sentry.io/1', false)).toEqual(
      expect.objectContaining({
        dsn: 'https://key@o1.ingest.de.sentry.io/1',
        environment: 'production',
        sendDefaultPii: false,
        attachScreenshot: false,
        attachViewHierarchy: false,
        enableCaptureFailedRequests: false,
        enableLogs: false,
        enableAutoSessionTracking: false,
        beforeSend: scrubEvent,
        beforeBreadcrumb: scrubBreadcrumb,
      }),
    );
    expect(reportingOptions('https://key@o1.ingest.de.sentry.io/1', true)?.environment).toBe(
      'development',
    );
  });
});

describe('startReporting', () => {
  const DSN = 'https://key@o1.ingest.de.sentry.io/1';
  const saved = {
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    inDev: process.env.EXPO_PUBLIC_SENTRY_IN_DEV,
  };

  /** The two variables as a test sets them, whatever the shell has. */
  function given(dsn: string | undefined, inDev: string | undefined) {
    for (const [name, value] of [
      ['EXPO_PUBLIC_SENTRY_DSN', dsn],
      ['EXPO_PUBLIC_SENTRY_IN_DEV', inDev],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  afterEach(() => given(saved.dsn, saved.inDev));

  it('starts nothing in development unless asked', () => {
    given(DSN, undefined);
    startReporting();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('starts in development when asked, with the options above', () => {
    given(DSN, '1');
    startReporting();
    expect(Sentry.init).toHaveBeenCalledWith(reportingOptions(DSN, true));
    expect(isReporting()).toBe(true);
  });

  it('starts nothing without a DSN, even when asked', () => {
    given(undefined, '1');
    startReporting();
    expect(Sentry.init).not.toHaveBeenCalled();
  });
});

describe('reportingErrorBoundary', () => {
  it('has Sentry report what the boundary catches', () => {
    const Boundary = () => null;
    const Reporting = () => null;
    jest.mocked(Sentry.wrapExpoRouterErrorBoundary).mockReturnValueOnce(Reporting);
    expect(reportingErrorBoundary(Boundary)).toBe(Reporting);
    expect(Sentry.wrapExpoRouterErrorBoundary).toHaveBeenCalledWith(Boundary);
  });
});

describe('reportError', () => {
  const DSN = 'https://key@o1.ingest.de.sentry.io/1';

  /** A fresh module, with reporting started or not, and the Sentry stand-in it uses. */
  function load(started: boolean) {
    const saved = {
      dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
      inDev: process.env.EXPO_PUBLIC_SENTRY_IN_DEV,
    };
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
    process.env.EXPO_PUBLIC_SENTRY_IN_DEV = '1';
    let loaded!: { reporting: typeof import('./reporting'); sentry: typeof Sentry };
    jest.isolateModules(() => {
      loaded = {
        reporting: jest.requireActual<typeof import('./reporting')>('./reporting'),
        sentry: jest.requireMock<typeof Sentry>('@sentry/react-native'),
      };
    });
    if (started) loaded.reporting.startReporting();
    for (const [name, value] of [
      ['EXPO_PUBLIC_SENTRY_DSN', saved.dsn],
      ['EXPO_PUBLIC_SENTRY_IN_DEV', saved.inDev],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    return loaded;
  }

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.mocked(console.warn).mockRestore();
  });

  it('writes to the console in development, as before', () => {
    const { reporting } = load(false);
    const error = new Error('down');
    reporting.reportError('Could not save the workout', error);
    expect(console.warn).toHaveBeenCalledWith('Could not save the workout', error);
  });

  it('sends nothing before reporting starts', () => {
    const { reporting, sentry } = load(false);
    reporting.reportError('Could not save the workout', new Error('down'));
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('sends an unexpected error, with what failed as a tag', () => {
    const { reporting, sentry } = load(true);
    const error = new Error('Cannot read property of undefined');
    reporting.reportError('Could not save the workout', error);
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { where: 'Could not save the workout' },
    });
  });

  it('masks what failed too, which can name a key holding the user’s id', () => {
    const { reporting, sentry } = load(true);
    reporting.reportError(
      'Could not read onboarding.00000000-0000-0000-0000-00000000000a.draft',
      new Error('disk'),
    );
    expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { where: 'Could not read onboarding.[id].draft' },
    });
  });

  it('sends a Supabase error as an Error with its message and code', () => {
    const { reporting, sentry } = load(true);
    reporting.reportError('Could not save the workout', {
      code: '23503',
      message: 'insert or update violates a foreign key',
      details: 'Key (workout_id)=(42) is not present',
    });
    const sent = jest.mocked(sentry.captureException).mock.calls[0]![0] as Error;
    expect(sent).toBeInstanceOf(Error);
    expect(sent.name).toBe('23503');
    expect(sent.message).toBe('insert or update violates a foreign key');
  });

  it('sends nothing the app expects: no network, a request given up, or its own refusals', () => {
    const { reporting, sentry } = load(true);
    for (const error of [
      new TypeError('Network request failed'),
      Object.assign(new Error('Aborted'), { name: 'AbortError' }),
      Object.assign(new Error('Failed to send a request'), { name: 'FunctionsFetchError' }),
      { code: 'BB009', message: 'Workout limit reached' },
    ]) {
      reporting.reportError('Could not save the workout', error);
    }
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
