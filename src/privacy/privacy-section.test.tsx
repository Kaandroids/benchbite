import { router } from 'expo-router';

import { useIsAccount } from '@/providers/session-provider';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { useConsents, useWithdrawAiConsent, useWithdrawHealthConsent } from './consents';
import { shareExport, TooManyExports, useWriteExport } from './export';
import { PrivacySection } from './privacy-section';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/providers/session-provider', () => ({ useIsAccount: jest.fn() }));
jest.mock('./consents', () => ({
  useConsents: jest.fn(),
  useWithdrawAiConsent: jest.fn(),
  useWithdrawHealthConsent: jest.fn(),
}));
jest.mock('./export', () => ({
  useWriteExport: jest.fn(),
  shareExport: jest.fn(),
  // Its own, as the real module reaches the database; the sheet and the test share this one.
  TooManyExports: class TooManyExports extends Error {},
}));

const GIVEN = new Date('2026-11-18T10:00:00Z');

/** A mutation as the hook returns it, with `state` changes. */
function mutation(state: object = {}) {
  return {
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    isError: false,
    ...state,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useIsAccount).mockReturnValue(true);
  jest.mocked(useConsents).mockReturnValue({
    data: { health: GIVEN, ai: GIVEN },
    isSuccess: true,
  } as never);
  jest.mocked(useWithdrawHealthConsent).mockReturnValue(mutation());
  jest.mocked(useWithdrawAiConsent).mockReturnValue(mutation());
  jest.mocked(useWriteExport).mockReturnValue(mutation());
  jest.mocked(shareExport).mockResolvedValue();
});

it('shows each consent with when it was given, and a way to withdraw it', async () => {
  await render(<PrivacySection />);
  expect(screen.getByText('Health data for your plan')).toBeOnTheScreen();
  expect(screen.getByText('AI: Bite and meals from photos')).toBeOnTheScreen();
  expect(screen.getAllByText(/Given on/)).toHaveLength(2);
  expect(
    screen.getByRole('button', { name: 'Withdraw your OK for health data' }),
  ).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Withdraw your OK for AI' })).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: 'Privacy policy' })).toBeOnTheScreen();
});

it('shows a guest only the health data consent, as the AI features need an account', async () => {
  jest.mocked(useIsAccount).mockReturnValue(false);
  await render(<PrivacySection />);
  expect(screen.queryByText('AI: Bite and meals from photos')).toBeNull();
});

it('offers the AI consent when it is not given', async () => {
  jest.mocked(useConsents).mockReturnValue({ data: { health: GIVEN }, isSuccess: true } as never);
  await render(<PrivacySection />);
  expect(screen.getByText('Not given')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Give' }));
  expect(router.push).toHaveBeenCalledWith('/ai-consent');
});

it('says what withdrawing the AI consent deletes before it does', async () => {
  const withdraw = mutation();
  jest.mocked(useWithdrawAiConsent).mockReturnValue(withdraw);
  await render(<PrivacySection />);

  await fireEvent.press(screen.getByRole('button', { name: 'Withdraw your OK for AI' }));
  expect(screen.getByText('Withdraw your OK for AI?')).toBeOnTheScreen();
  expect(screen.getByText('Bite’s notebook about you')).toBeOnTheScreen();
  expect(screen.getByText('Stays: meals you’ve logged, also those from photos.')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Withdraw and delete' }));
  expect((withdraw as { mutate: jest.Mock }).mutate).toHaveBeenCalled();
});

it('says what withdrawing the health data consent deletes, and when it failed', async () => {
  jest.mocked(useWithdrawHealthConsent).mockReturnValue(mutation({ isError: true }));
  await render(<PrivacySection />);

  await fireEvent.press(screen.getByRole('button', { name: 'Withdraw your OK for health data' }));
  expect(screen.getByText('All workouts, meals and records')).toBeOnTheScreen();
  expect(screen.getByText('Couldn’t withdraw it. Try again.')).toBeOnTheScreen();
});

it('closes the sheet on Cancel without withdrawing', async () => {
  const withdraw = mutation();
  jest.mocked(useWithdrawAiConsent).mockReturnValue(withdraw);
  await render(<PrivacySection />);
  await fireEvent.press(screen.getByRole('button', { name: 'Withdraw your OK for AI' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText('Withdraw your OK for AI?')).toBeNull();
  expect((withdraw as { mutate: jest.Mock }).mutate).not.toHaveBeenCalled();
});

it('exports the data: says what the file holds, makes it, and shares it once the sheet closes', async () => {
  const file = { uri: 'file:///cache/benchbite-data.json' };
  const write = mutation({
    mutate: jest.fn((_: unknown, { onSuccess }: { onSuccess: (made: object) => void }) =>
      onSuccess(file),
    ),
  });
  jest.mocked(useWriteExport).mockReturnValue(write);
  await render(<PrivacySection />);

  await fireEvent.press(screen.getByRole('button', { name: 'Export your data' }));
  expect(
    screen.getByText(
      'Chats with Bite with their photos and voice messages, Bite’s notebook, and what each answer used',
    ),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Export' }));
  expect(screen.queryByText('In the file')).toBeNull();
  await waitFor(() => expect(shareExport).toHaveBeenCalledWith(file, 'Export your data'));
});

it('says when the file could not be made', async () => {
  jest.mocked(useWriteExport).mockReturnValue(mutation({ isError: true }));
  await render(<PrivacySection />);
  await fireEvent.press(screen.getByRole('button', { name: 'Export your data' }));
  expect(screen.getByText('Couldn’t make the file. Try again.')).toBeOnTheScreen();
});

it('says when the user has made their two exports of the hour', async () => {
  jest
    .mocked(useWriteExport)
    .mockReturnValue(mutation({ isError: true, error: new TooManyExports() }));
  await render(<PrivacySection />);
  await fireEvent.press(screen.getByRole('button', { name: 'Export your data' }));
  expect(
    screen.getByText('You can export your data twice an hour. Try again later.'),
  ).toBeOnTheScreen();
});

it('offers to export the data first from a withdrawal', async () => {
  await render(<PrivacySection />);
  await fireEvent.press(screen.getByRole('button', { name: 'Withdraw your OK for health data' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Export your data first' }));
  expect(await screen.findByText('In the file')).toBeOnTheScreen();
  expect(screen.queryByText('Withdraw your OK for health data?')).toBeNull();
});
