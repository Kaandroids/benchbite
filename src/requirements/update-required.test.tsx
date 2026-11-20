import { Linking, Platform } from 'react-native';

import { fireEvent, render, screen, waitFor } from '@/test/render';

import { storeUrl, UpdateRequired } from './update-required';

jest.mock('expo-application', () => ({
  applicationId: 'com.benchbite.app',
  nativeApplicationVersion: '1.3.0',
}));

let mockConfig: { ios?: { appStoreUrl?: string }; android?: { playStoreUrl?: string } } = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig;
    },
  },
}));

beforeEach(() => {
  mockConfig = {};
  Platform.OS = 'ios';
  // Reset too: the calls of the tests before would count otherwise.
  jest.spyOn(Linking, 'openURL').mockReset().mockResolvedValue(undefined);
});

it('says the version is no longer supported, that the data stays, and which version this is', async () => {
  await render(<UpdateRequired />);
  expect(screen.getByRole('header', { name: 'Update Benchbite' })).toBeOnTheScreen();
  expect(
    screen.getByText(
      'This version is no longer supported. Update the app to carry on. Your data stays as it is.',
    ),
  ).toBeOnTheScreen();
  expect(screen.getByText('Version 1.3.0')).toBeOnTheScreen();
});

it('opens the app’s page in the App Store on an iPhone', async () => {
  mockConfig = { ios: { appStoreUrl: 'https://apps.apple.com/app/id1234567890' } };
  await render(<UpdateRequired />);
  await fireEvent.press(screen.getByRole('button', { name: 'Update in the App Store' }));
  expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id1234567890');
});

it('opens the app’s page on Google Play on Android', async () => {
  Platform.OS = 'android';
  await render(<UpdateRequired />);
  await fireEvent.press(screen.getByRole('button', { name: 'Update on Google Play' }));
  expect(Linking.openURL).toHaveBeenCalledWith('market://details?id=com.benchbite.app');
});

it('opens Google Play on the web on a device without the Play Store', async () => {
  Platform.OS = 'android';
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No Activity found'));
  await render(<UpdateRequired />);
  await fireEvent.press(screen.getByRole('button', { name: 'Update on Google Play' }));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(2));
  expect(Linking.openURL).toHaveBeenLastCalledWith(
    'https://play.google.com/store/apps/details?id=com.benchbite.app',
  );
});

it('takes each store’s address from the app’s config where it names one', () => {
  expect(storeUrl()).toBe('https://apps.apple.com/');
  Platform.OS = 'android';
  mockConfig = { android: { playStoreUrl: 'https://play.google.com/store/apps/details?id=x' } };
  expect(storeUrl()).toBe('https://play.google.com/store/apps/details?id=x');
});

it('has no way past it', async () => {
  await render(<UpdateRequired />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
});
