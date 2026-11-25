// A stand-in for react-native-webview, whose native module tests do not have: it renders nothing
// and loads no page. captcha-host.test.tsx has one of its own that plays the page.
import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

export const WebView = forwardRef(function WebView(_props: object, ref) {
  useImperativeHandle(ref, () => ({ injectJavaScript: () => {} }));
  return <View />;
});
