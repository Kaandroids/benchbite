import { Linking } from 'react-native';

import { useWithdrawHealthConsent } from '@/privacy/consents';
import { fireEvent, render, screen } from '@/test/render';

import { useConsentAsk, useGiveHealthConsent } from './consent-update';
import { ConsentUpdateScreen } from './consent-update-screen';

jest.mock('./consent-update', () => ({
  useConsentAsk: jest.fn(),
  useGiveHealthConsent: jest.fn(),
}));
jest.mock('@/privacy/consents', () => ({ useWithdrawHealthConsent: jest.fn() }));
jest.mock('@/privacy/export-sheet', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ExportSheet: () => <Text>Export sheet</Text> };
});

const ASK = { version: '2027-02-01', summary: 'Names your progress photos too' };
const give = jest.fn();
const withdraw = jest.fn();
const mutation = (mutate: jest.Mock, state: { isPending?: boolean; isError?: boolean } = {}) =>
  ({ mutate, reset: jest.fn(), isPending: false, isError: false, ...state }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockReset().mockResolvedValue(undefined);
  jest.mocked(useConsentAsk).mockReturnValue(ASK);
  jest.mocked(useGiveHealthConsent).mockReturnValue(mutation(give));
  jest.mocked(useWithdrawHealthConsent).mockReturnValue(mutation(withdraw));
});

const agree = () => screen.getByRole('button', { name: 'Agree and continue' });
const box = () =>
  screen.getByRole('checkbox', {
    name: 'I agree that Benchbite processes my health data for these purposes.',
  });

it('says what is collected, what for and what changed', async () => {
  await render(<ConsentUpdateScreen />);
  expect(screen.getByRole('header', { name: 'We need your OK again' })).toBeOnTheScreen();
  expect(screen.getByText('What we collect')).toBeOnTheScreen();
  expect(screen.getByText('Used for')).toBeOnTheScreen();
  expect(screen.getByText('What changed')).toBeOnTheScreen();
  expect(screen.getByText('Names your progress photos too')).toBeOnTheScreen();
});

it('leaves out what changed when the version does not say', async () => {
  jest.mocked(useConsentAsk).mockReturnValue({ version: '2027-02-01' });
  await render(<ConsentUpdateScreen />);
  expect(screen.queryByText('What changed')).not.toBeOnTheScreen();
});

it('records the consent only once the box is ticked, for the version shown', async () => {
  await render(<ConsentUpdateScreen />);
  expect(box()).not.toBeChecked();
  expect(agree()).toBeDisabled();

  await fireEvent.press(box());
  await fireEvent.press(agree());
  expect(give).toHaveBeenCalledWith('2027-02-01');
});

it('opens the privacy policy to read without ticking the box', async () => {
  await render(<ConsentUpdateScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Read the privacy policy' }));
  expect(Linking.openURL).toHaveBeenCalledWith('https://benchbite.com/privacy');
  expect(box()).not.toBeChecked();
});

it('has no Later, and says what declining means', async () => {
  await render(<ConsentUpdateScreen />);
  expect(screen.queryByRole('button', { name: 'Later' })).not.toBeOnTheScreen();
  expect(
    screen.getByText(
      'Without it Benchbite can’t keep your health data. You’ll see what is deleted before anything is.',
    ),
  ).toBeOnTheScreen();
});

it('shows what goes before a consent is withdrawn, and withdraws only on its button', async () => {
  await render(<ConsentUpdateScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'I don’t agree' }));
  expect(screen.getByText('Withdraw your OK for health data?')).toBeOnTheScreen();
  expect(withdraw).not.toHaveBeenCalled();
});

it('says when the answer could not be saved', async () => {
  jest.mocked(useGiveHealthConsent).mockReturnValue(mutation(give, { isError: true }));
  await render(<ConsentUpdateScreen />);
  expect(screen.getByText('That couldn’t be saved. Try again.')).toBeOnTheScreen();
});

it('shows nothing once there is nothing to ask', async () => {
  jest.mocked(useConsentAsk).mockReturnValue(null);
  await render(<ConsentUpdateScreen />);
  expect(screen.queryByRole('header')).not.toBeOnTheScreen();
});
