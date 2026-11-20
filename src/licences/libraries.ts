// The open source libraries that are part of the app, by their licence (#29, ADR 0160), as
// `pnpm licences` writes them to libraries.json from the app's own bundle.
import data from './libraries.json';

export type Library = {
  name: string;
  version: string;
  /** The copyright lines of the library's licence file. */
  copyright: string[];
  /** The library's own licence text, when it differs from its licence's usual one. */
  text?: string;
};

export type Licence = {
  /** The licence as the libraries name it, such as "MIT". */
  id: string;
  /** The licence's text, without any library's copyright lines. */
  text: string;
  libraries: Library[];
};

/** The licences, the one with the most libraries first. */
export const LICENCES: readonly Licence[] = data.licences;

/** The address of a licence's own screen. */
export const licenceHref = (index: number) => `/licences/${index}` as const;
