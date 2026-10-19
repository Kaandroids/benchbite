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

| ADR                                       | Title                                   | Status   |
| ----------------------------------------- | --------------------------------------- | -------- |
| [0001](0001-react-native-and-supabase.md) | Use React Native with Expo and Supabase | Accepted |
