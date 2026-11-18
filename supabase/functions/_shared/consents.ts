// The consents a link from the website withdraws (ADR 0146), as its pages and the database name
// them.
export const CONSENTS = ['health', 'ai'] as const;
export type Consent = (typeof CONSENTS)[number];

/** The consent a form named, or none for anything else. */
export const consentOf = (value: unknown): Consent | undefined =>
  CONSENTS.find((consent) => consent === value);
