import { router, usePathname } from 'expo-router';

import { isReporting } from '@/lib/reporting';
import { fireEvent, render, screen } from '@/test/render';

import {
  AppErrorBoundary,
  ErrorScreen,
  SectionErrorBoundary,
  TabErrorBoundary,
  TodayErrorBoundary,
} from './error-screen';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
  usePathname: jest.fn(() => '/workout'),
}));
jest.mock('@/lib/reporting', () => ({
  isReporting: jest.fn(() => false),
  reportingErrorBoundary: <T,>(boundary: T) => boundary,
}));

const error = new Error('Render failed');

/** Each test an hour after the last, so that no Try again of one counts in the next. */
let hour = 0;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(usePathname).mockReturnValue('/workout');
  hour += 1;
  jest.useFakeTimers({ now: new Date(Date.UTC(2026, 10, 19, hour)) });
});

afterEach(() => {
  jest.useRealTimers();
});

/** A retry as Expo Router gives it, done at once. */
const retry = () => jest.fn(() => Promise.resolve());

it('says the whole app failed, that what was logged is safe, and tries again', async () => {
  const again = retry();
  await render(<AppErrorBoundary error={error} retry={again} />);
  expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
  expect(
    screen.getByText('Benchbite hit a problem it didn’t expect. What you logged is safe.'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Go to Today')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(again).toHaveBeenCalled();
});

it('says one part failed, and offers Today', async () => {
  await render(<SectionErrorBoundary error={error} retry={retry()} />);
  expect(screen.getByText('This part didn’t load')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Go to Today' }));
  expect(router.navigate).toHaveBeenCalledWith('/');
});

it('offers no Today on Today itself', async () => {
  await render(<TodayErrorBoundary error={error} retry={retry()} />);
  expect(screen.getByText('This part didn’t load')).toBeOnTheScreen();
  expect(screen.queryByText('Go to Today')).toBeNull();
});

it('keeps its buttons above the floating tab bar in a tab, and only there', async () => {
  const tab = await render(<TabErrorBoundary error={error} retry={retry()} />);
  expect(screen.getByTestId('tab-bar-room')).toBeOnTheScreen();
  await tab.unmount();
  await render(<TodayErrorBoundary error={error} retry={retry()} />);
  expect(screen.getByTestId('tab-bar-room')).toBeOnTheScreen();
  await screen.unmount();
  await render(<SectionErrorBoundary error={error} retry={retry()} />);
  expect(screen.queryByTestId('tab-bar-room')).toBeNull();
});

describe('failing again soon after Try again', () => {
  async function failTwice(scope: 'app' | 'section', after: number) {
    const first = await render(<ErrorScreen scope={scope} error={error} retry={retry()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await first.unmount();
    jest.advanceTimersByTime(after);
    await render(<ErrorScreen scope={scope} error={error} retry={retry()} />);
  }

  it('says it is still not working, rather than the same words', async () => {
    await failTwice('app', 5_000);
    expect(screen.getByText('Still not working')).toBeOnTheScreen();
    expect(screen.getByText('Close Benchbite and open it again.')).toBeOnTheScreen();
  });

  it('says it was told only when reporting is on', async () => {
    jest.mocked(isReporting).mockReturnValue(true);
    await failTwice('section', 5_000);
    expect(
      screen.getByText(
        'Close Benchbite and open it again. If it keeps happening, an update will fix it soon: we’ve been told.',
      ),
    ).toBeOnTheScreen();
  });

  it('takes a first failure elsewhere as a new one', async () => {
    const first = await render(<TabErrorBoundary error={error} retry={retry()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await first.unmount();
    jest.advanceTimersByTime(5_000);
    jest.mocked(usePathname).mockReturnValue('/bite/notebook');
    await render(<SectionErrorBoundary error={error} retry={retry()} />);
    expect(screen.getByText('This part didn’t load')).toBeOnTheScreen();
  });

  it('takes a failure long after Try again as a new one', async () => {
    await failTwice('section', 60_000);
    expect(screen.getByText('This part didn’t load')).toBeOnTheScreen();
  });
});
