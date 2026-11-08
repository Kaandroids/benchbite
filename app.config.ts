// The app's config is app.json. This gives the development build an identity of its own, so that it
// is installed beside a release build on the same phone rather than in its place (ADR 0096). A
// release build is made with APP_VARIANT=production.
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const app = config as ExpoConfig;
  if (process.env.APP_VARIANT === 'production') {
    return app;
  }
  return {
    ...app,
    name: 'Benchbite Dev',
    scheme: 'benchbite-dev',
    ios: { ...app.ios, bundleIdentifier: 'com.benchbite.app.dev' },
    android: { ...app.android, package: 'com.benchbite.app.dev' },
  };
};
