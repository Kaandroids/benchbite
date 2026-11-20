import { router } from 'expo-router';
import { Linking } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { useAcceptTerms, usePutOffTerms, useTermsAsk, type TermsAsk } from './terms-update';
import { TermsUpdateScreen } from './terms-update-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./terms-update', () => ({
  useTermsAsk: jest.fn(),
  useAcceptTerms: jest.fn(),
  usePutOffTerms: jest.fn(),
}));
jest.mock('@/privacy/export-sheet', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ExportSheet: () => <Text>Export sheet</Text> };
});

const ANNOUNCED: TermsAsk = {
  version: '2027-02-01',
  appliesAt: new Date('2027-03-03T12:00:00'),
  due: false,
  summary: 'Premium by the year',
};
const DUE: TermsAsk = { ...ANNOUNCED, due: true };

const mutate = jest.fn();
const reset = jest.fn();
const putOff = jest.fn();
const accepting = (state: { isPending?: boolean; isError?: boolean } = {}) =>
  jest
    .mocked(useAcceptTerms)
    .mockReturnValue({ mutate, reset, isPending: false, isError: false, ...state } as never);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockReset().mockResolvedValue(undefined);
  jest.mocked(useTermsAsk).mockReturnValue(ANNOUNCED);
  jest.mocked(usePutOffTerms).mockReturnValue(putOff);
  accepting();
});

const accept = () => screen.getByRole('button', { name: 'Accept and continue' });
const box = () => screen.getByRole('checkbox', { name: 'I accept the Terms of use.' });

describe('before the terms apply', () => {
  it('says from when they apply and what changed', async () => {
    await render(<TermsUpdateScreen />);
    expect(screen.getByRole('header', { name: 'We’ve updated our terms' })).toBeOnTheScreen();
    expect(screen.getByText(/apply from March 3, 2027\./)).toBeOnTheScreen();
    expect(screen.getByText('What changed')).toBeOnTheScreen();
    expect(screen.getByText('Premium by the year')).toBeOnTheScreen();
  });

  it('accepts only once the box is ticked, with the version shown', async () => {
    await render(<TermsUpdateScreen />);
    expect(box()).not.toBeChecked();
    expect(accept()).toBeDisabled();

    await fireEvent.press(box());
    await fireEvent.press(accept());
    expect(mutate).toHaveBeenCalledWith('2027-02-01');
  });

  it('opens the terms to read without ticking the box', async () => {
    await render(<TermsUpdateScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Read the terms of use' }));
    expect(Linking.openURL).toHaveBeenCalledWith('https://benchbite.com/terms');
    expect(box()).not.toBeChecked();
  });

  it('puts the question off with Later, and offers no way out of the account', async () => {
    await render(<TermsUpdateScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Later' }));
    expect(putOff).toHaveBeenCalledWith('2027-02-01');
    expect(screen.queryByRole('button', { name: 'Delete my account' })).not.toBeOnTheScreen();
  });

  it('leaves out what changed when the version does not say', async () => {
    jest.mocked(useTermsAsk).mockReturnValue({ ...ANNOUNCED, summary: undefined });
    await render(<TermsUpdateScreen />);
    expect(screen.queryByText('What changed')).not.toBeOnTheScreen();
  });

  it('does not keep a tick for terms that changed again meanwhile', async () => {
    const view = await render(<TermsUpdateScreen />);
    await fireEvent.press(box());
    jest.mocked(useTermsAsk).mockReturnValue({ ...ANNOUNCED, version: '2027-02-15' });
    await view.rerender(<TermsUpdateScreen />);
    expect(box()).not.toBeChecked();
    expect(accept()).toBeDisabled();
  });
});

describe('from the day the terms apply', () => {
  beforeEach(() => jest.mocked(useTermsAsk).mockReturnValue(DUE));

  it('has no Later, and says the data stays until the user decides', async () => {
    await render(<TermsUpdateScreen />);
    expect(screen.getByRole('header', { name: 'Our new terms apply now' })).toBeOnTheScreen();
    expect(screen.getByText(/Your data stays as it is until you decide\./)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Later' })).not.toBeOnTheScreen();
  });

  it('offers the export of the data', async () => {
    await render(<TermsUpdateScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
    expect(screen.getByText('Export sheet')).toBeOnTheScreen();
  });

  it('leads to deleting the account', async () => {
    await render(<TermsUpdateScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(router.push).toHaveBeenCalledWith('/account/delete');
  });
});

it('says when the answer could not be saved', async () => {
  accepting({ isError: true });
  await render(<TermsUpdateScreen />);
  expect(screen.getByText('That couldn’t be saved. Try again.')).toBeOnTheScreen();
});

it('shows nothing once there is nothing to ask', async () => {
  jest.mocked(useTermsAsk).mockReturnValue(null);
  await render(<TermsUpdateScreen />);
  expect(screen.queryByRole('header')).not.toBeOnTheScreen();
});
