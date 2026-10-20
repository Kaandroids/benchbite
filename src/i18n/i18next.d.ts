import 'i18next';

import type { resources } from '.';

// Types `t()` against the English resources, so a misspelled key fails the typecheck.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)['en'];
  }
}
