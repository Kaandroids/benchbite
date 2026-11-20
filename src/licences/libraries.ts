// The open source libraries that are part of the app, by their licence (#29, ADR 0160), as
// `pnpm licences` writes them to libraries.json from the app's own bundle.
import data from './libraries.json';
import type { Licence } from './types';

export type { Library, Licence } from './types';

/** The licences, the one with the most libraries first. */
export const LICENCES: readonly Licence[] = data.licences;

/** The address of a licence's own screen. */
export const licenceHref = (index: number) => `/licences/${index}` as const;
