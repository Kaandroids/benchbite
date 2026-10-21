// Loads the parts of Reanimated and Worklets that run without their native modules, as
// react-native-reanimated/jest/resolver does. That resolver recognises the packages by their name
// anywhere in the path, and pnpm puts the Worklets name into Reanimated's folder name too
// (react-native-reanimated@4.7.1_react-native-worklets@...), so all of Reanimated would load its
// web build, which needs a browser. Here the packages are recognised by their own folder.
const REANIMATED = '/node_modules/react-native-reanimated/';
const WORKLETS = '/node_modules/react-native-worklets/';

// The Reanimated modules whose web build Reanimated's resolver loads in tests.
const REANIMATED_WEB_ONLY = new Set([
  'initializers',
  'mutables',
  'mappers',
  'ConfigHelper',
  'UpdateLayoutAnimations',
  'useAnimatedRef',
  'useAnimatedStyle',
  'WorkletEventHandler',
  'JSPropsUpdater',
  'updateProps',
  'util',
  'css/component/AnimatedComponent',
]);

function isReanimatedWebOnly(request, basedir) {
  if (!request.startsWith('.') || !basedir.includes(REANIMATED)) {
    return false;
  }
  const basename = request.split('/').pop();
  return [...REANIMATED_WEB_ONLY].some((entry) =>
    entry.includes('/') ? request.endsWith(entry) : basename === entry,
  );
}

function isWorklets(request, basedir) {
  return (
    request === 'react-native-worklets' ||
    request.startsWith('react-native-worklets/') ||
    basedir.includes(WORKLETS)
  );
}

/** @type {import('jest-resolve').SyncResolver} */
module.exports = (request, options) => {
  if (isReanimatedWebOnly(request, options.basedir) || isWorklets(request, options.basedir)) {
    return options.defaultResolver(request, {
      ...options,
      extensions: options.extensions?.filter((extension) => !extension.includes('native')),
    });
  }
  return options.defaultResolver(request, options);
};
