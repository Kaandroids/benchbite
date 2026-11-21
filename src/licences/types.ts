// The shape of libraries.json, which `pnpm licences` writes and the licences screen reads.

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
