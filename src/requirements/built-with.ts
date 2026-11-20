// The versions of the texts this build was made with. The server says the current ones
// (ADR 0156); these stand in until it has, as on a first start without a connection.

// The version of the privacy policy that the health data consent refers to (#44), recorded with
// each consent.
export const PRIVACY_POLICY_VERSION = '2026-10-21';

// The version of the terms of use the user accepts in the onboarding, recorded with each
// acceptance (ADR 0141).
export const TERMS_VERSION = '2026-11-18';

// The version of the AI consent's text, recorded with each consent. Raising a version asks no one
// again by itself: the server must then require it (ADR 0142).
export const AI_CONSENT_VERSION = '2026-11-18';
