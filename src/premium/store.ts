import { Platform } from 'react-native';

/** The store the app comes from, which bills the subscription. */
export const STORE_NAME = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

/** Where the user manages and cancels their subscriptions, in their phone's store. */
export const SUBSCRIPTIONS_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
