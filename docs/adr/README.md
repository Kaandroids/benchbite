# Architecture Decision Records

This folder records significant decisions about the project: what was decided, why, and what it costs.
The format follows [Michael Nygard's ADR template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## Writing a new ADR

1. Copy [`template.md`](template.md) to `NNNN-short-title.md` with the next number.
2. Fill it in and add it to the index below.
3. Submit it in the same pull request that introduces the decision.

ADRs are not edited after they are accepted. To change a decision, write a new ADR
and mark the old one as `Superseded by ADR-NNNN`.

## Index

| ADR                                              | Title                                                  | Status   |
| ------------------------------------------------ | ------------------------------------------------------ | -------- |
| [0001](0001-react-native-and-supabase.md)        | Use React Native with Expo and Supabase                | Accepted |
| [0002](0002-single-expo-project-at-the-root.md)  | Keep a single Expo project at the repository root      | Accepted |
| [0003](0003-local-first-database-development.md) | Develop the database against a local Supabase stack    | Accepted |
| [0004](0004-auth-session-storage.md)             | Store the auth session with expo-sqlite's localStorage | Accepted |
| [0005](0005-guest-first-accounts.md)             | Let people start as guests with anonymous sign-ins     | Accepted |
