// A stand-in for the health store's platform module in tests (src/health/platform.*.ts), whose
// native modules do not load there: a phone without a store, unless a test says otherwise.
export const store = null;
export const availability = jest.fn(() => Promise.resolve('unavailable'));
export const requestAccess = jest.fn(() => Promise.resolve(false));
export const stillAllowed = jest.fn(() => Promise.resolve(false));
export const releaseAccess = jest.fn(() => Promise.resolve());
export const installStore = jest.fn();
