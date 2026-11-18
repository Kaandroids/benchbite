// A stand-in for @sentry/react-native in tests, which sends nothing: its SDK needs its native
// module, and no test should reach Sentry.
import type { ComponentType } from 'react';

export const init = jest.fn();
export const wrap = <P extends object>(component: ComponentType<P>) => component;
