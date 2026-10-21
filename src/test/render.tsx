// Renders components the way the app does: with translations, the safe area and the gesture
// handler root. Tests import
// render and screen from here instead of from the testing library.
import '@/i18n';

import { render as renderComponent, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function render(ui: ReactElement, options?: RenderOptions) {
  return renderComponent(ui, {
    wrapper: ({ children }) => (
      <GestureHandlerRootView>
        <SafeAreaProvider initialMetrics={SAFE_AREA}>{children}</SafeAreaProvider>
      </GestureHandlerRootView>
    ),
    ...options,
  });
}

export * from '@testing-library/react-native';
