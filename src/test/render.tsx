// Renders components the way the app does: with translations and the safe area. Tests import
// render and screen from here instead of from the testing library.
import '@/i18n';

import { render as renderComponent, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function render(ui: ReactElement, options?: RenderOptions) {
  return renderComponent(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider initialMetrics={SAFE_AREA}>{children}</SafeAreaProvider>
    ),
    ...options,
  });
}

export * from '@testing-library/react-native';
