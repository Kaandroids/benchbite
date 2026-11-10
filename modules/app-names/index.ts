// The names of the apps on an Android phone, by their package, as the phone shows them
// (ADR 0107). Without the native module, as in a build from before it, no app has a name.
import { requireOptionalNativeModule } from 'expo';

const AppNames = requireOptionalNativeModule<{ appName(packageName: string): string | null }>(
  'AppNames',
);

/** The name an app shows on the phone, or null for one the phone does not have or show. */
export const appName = (packageName: string): string | null =>
  AppNames?.appName(packageName) ?? null;
