import appConfig from '../../app.json';

import { darkColors } from '@/theme/colors';

import { BRAND_ORANGE, SPLASH_PLATE_WIDTH } from './mark';

type SplashOptions = {
  backgroundColor: string;
  imageWidth: number;
  dark: { backgroundColor: string };
};

function splashOptions(): SplashOptions {
  const plugin = appConfig.expo.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen',
  );
  return (plugin as [string, SplashOptions])[1];
}

// The native splash screen and the animation that takes over from it must match exactly, or the
// plate jumps or the colour flashes at the hand-off.
describe('the mark', () => {
  it('matches the native splash screen in app.json', () => {
    const splash = splashOptions();
    expect(splash.backgroundColor).toBe(BRAND_ORANGE);
    expect(splash.dark.backgroundColor).toBe(darkColors.background);
    expect(splash.imageWidth).toBe(SPLASH_PLATE_WIDTH);
  });

  it('uses the brand orange behind the Android icon', () => {
    expect(appConfig.expo.android.adaptiveIcon.backgroundColor).toBe(BRAND_ORANGE);
  });
});
