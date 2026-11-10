// The names of the apps on an Android phone, by their package. Health Connect names the app that
// wrote data only by its package (#468, ADR 0106), which the screens show by its name instead.
import { requireNativeModule } from 'expo';

const AppNames = requireNativeModule<{ appName(packageName: string): string | null }>('AppNames');

/** The name an app shows on the phone, or null for one the phone does not have or show. */
export const appName = (packageName: string): string | null => AppNames.appName(packageName);
