// A stand-in for expo-notifications in tests, which schedules and shows nothing: the functions the
// app calls are mocks each test can set, and the package's constants are its own.
const actual = jest.requireActual<typeof import('expo-notifications')>('expo-notifications');

export const AndroidImportance = actual.AndroidImportance;
export const SchedulableTriggerInputTypes = actual.SchedulableTriggerInputTypes;

const granted = { granted: true, canAskAgain: true, status: 'granted', expires: 'never' };

export const getPermissionsAsync = jest.fn(() => Promise.resolve(granted));
export const requestPermissionsAsync = jest.fn(() => Promise.resolve(granted));
export const setNotificationHandler = jest.fn();
export const setNotificationChannelAsync = jest.fn(() => Promise.resolve(null));
export const scheduleNotificationAsync = jest.fn(() => Promise.resolve('id'));
export const cancelScheduledNotificationAsync = jest.fn(() => Promise.resolve());
export const getAllScheduledNotificationsAsync = jest.fn(() => Promise.resolve([]));
