// Expo's Metro config, with the debug IDs Sentry needs to match the release build's source maps to
// its code (ADR 0149).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
