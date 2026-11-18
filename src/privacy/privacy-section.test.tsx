import { router } from 'expo-router';

import { useIsAccount } from '@/providers/session-provider';
import { fireEvent, render, screen } from '@/test/render';

import { useConsents, useWithdrawAiConsent, useWithdrawHealthConsent } from './consents';
import { PrivacySection } from './privacy-section';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/providers/session-provider', () => ({ useIsAccount: jest.fn() }));
jest.mock('./consents', () => ({
  useConsents: jest.fn(),
  useWithdrawAiConsent: jest.fn(),
  useWithdrawHealthConsent: jest.fn(),
}));

const GIVEN = new Date('2026-11-18T10:00:00Z');

/** A withdrawal as the mutation is, with `state` changes. */
function withdrawal(state: object = {}) {
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
  jest.mocked(useWithdrawHealthConsent).mockReturnValue(withdrawal());
  jest.mocked(useWithdrawAiConsent).mockReturnValue(withdrawal());
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
  const withdraw = withdrawal();
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
  jest.mocked(useWithdrawHealthConsent).mockReturnValue(withdrawal({ isError: true }));
  await render(<PrivacySection />);

  await fireEvent.press(screen.getByRole('button', { name: 'Withdraw your OK for health data' }));
  expect(screen.getByText('All workouts, meals and records')).toBeOnTheScreen();
  expect(screen.getByText('Couldn’t withdraw it. Try again.')).toBeOnTheScreen();
});

it('closes the sheet on Cancel without withdrawing', async () => {
  const withdraw = withdrawal();
  jest.mocked(useWithdrawAiConsent).mockReturnValue(withdraw);
  await render(<PrivacySection />);
  await fireEvent.press(screen.getByRole('button', { name: 'Withdraw your OK for AI' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText('Withdraw your OK for AI?')).toBeNull();
  expect((withdraw as { mutate: jest.Mock }).mutate).not.toHaveBeenCalled();
});
