import { createContext, type ReactNode } from 'react';

import type { ColorScheme } from './index';

/** The scheme a part of the app keeps whatever the system's, or null to follow the system. */
export const SchemeContext = createContext<ColorScheme | null>(null);

/**
 * Keeps what it wraps in one scheme whatever the system's, for a screen that stands apart from the
 * app's own, such as the special offer, which is always dark.
 */
export function ThemeScheme({ scheme, children }: { scheme: ColorScheme; children: ReactNode }) {
  return <SchemeContext.Provider value={scheme}>{children}</SchemeContext.Provider>;
}
