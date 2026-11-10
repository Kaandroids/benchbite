// Benchbite on the Apple Watch (#470, ADR 0110): follows the workout in progress on the phone and
// logs its sets from the wrist, talking to the phone as ADR 0109 sets out.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'watch',
  name: 'BenchbiteWatch',
  displayName: 'Benchbite',
  // Inside the phone app's: com.benchbite.app.watchkitapp, and .dev.watchkitapp for the dev build.
  bundleIdentifier: '.watchkitapp',
  deploymentTarget: '10.0',
  frameworks: ['SwiftUI', 'WatchConnectivity'],
  icon: '../../assets/images/icon.png',
};
