// The versions of the texts this build was made with. The server says the current ones
// (ADR 0156); these stand in until it has, as on a first start without a connection.

// The version of the health data consent's text, recorded with each consent. Raising it here asks
// no one again: the server's row for a new version does, at the next start (ADR 0156, ADR 0159).
export const HEALTH_CONSENT_VERSION = '2026-11-23';

// The version of the terms of use the user accepts in the onboarding, recorded with each
// acceptance (ADR 0141).
export const TERMS_VERSION = '2026-11-18';

// The version of the AI consent's text, recorded with each consent. Raising it here asks no one
// again: the server's row for a new version does, at the next use of the AI features (ADR 0156,
// ADR 0159).
export const AI_CONSENT_VERSION = '2026-11-18';
