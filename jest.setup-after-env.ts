// Runs in every test file once Jest is set up.

// Reanimated runs its animations on the JavaScript thread in tests.
require('react-native-reanimated').setUpTests();

// Gesture Handler's mocks, for components such as the slider.
require('react-native-gesture-handler/jestSetup');

// Gesture Handler binds itself to Reanimated's UI runtime when it loads, which Jest does not have.
jest.mock('react-native-worklets', () => ({
  ...jest.requireActual<object>('react-native-worklets'),
  getUIRuntimeHolder: () => ({}),
}));

// expo-audio has no native module in tests; this stand-in records and plays nothing.
jest.mock('expo-audio', () => require('./src/test/expo-audio'));

// expo-notifications schedules nothing in tests; this stand-in's functions are mocks.
jest.mock('expo-notifications', () => require('./src/test/expo-notifications'));

// The health store's native modules do not load in tests; this stand-in has no store.
jest.mock('./src/health/platform', () => require('./src/test/health-platform'));
