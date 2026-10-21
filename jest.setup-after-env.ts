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
