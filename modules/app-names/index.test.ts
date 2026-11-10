jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

/** The module as loaded in a build with this native module, or none. */
function load(native: { appName(packageName: string): string | null } | null) {
  let loaded: typeof import('./index') | undefined;
  jest.isolateModules(() => {
    jest
      .mocked(jest.requireMock<typeof import('expo')>('expo').requireOptionalNativeModule)
      .mockReturnValue(native);
    loaded = jest.requireActual<typeof import('./index')>('./index');
  });
  return loaded!;
}

it('asks the native module for an app’s name', () => {
  expect(load({ appName: () => 'Zepp' }).appName('com.huami.watch.hmwatchmanager')).toBe('Zepp');
});

it('names no app in a build without the native module', () => {
  expect(load(null).appName('com.huami.watch.hmwatchmanager')).toBeNull();
});
