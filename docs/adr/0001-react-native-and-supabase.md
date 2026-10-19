# 0001. Use React Native with Expo and Supabase

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Benchbite combines workout tracking and nutrition tracking in a single mobile app.

The constraints are:

- The app must run on both iOS and Android from a single codebase.
- There is no capacity to operate servers, so the backend should be managed.
- The data is relational (users, workouts, exercises, sets, meals, foods) and must be isolated per user.
- The stack should have a large ecosystem and an active community.

## Decision

- The mobile app is built with **React Native and Expo**, using Expo Router for navigation
  and EAS for builds and store submission.
- The backend is **Supabase**: Postgres with Row Level Security for data and authorization,
  Supabase Auth for authentication, and Edge Functions for server-side logic.
- There is no separate backend server.

## Alternatives considered

- **Flutter:** Comparable cross-platform capabilities, but Dart is used less outside Flutter,
  while React and TypeScript skills transfer to web development.
- **Native apps (Swift and Kotlin):** Best platform integration, but two codebases double the
  implementation and maintenance effort for every feature.
- **Firebase:** Mature and well documented, but its document database is a poor fit for
  relational fitness and nutrition data, and its pricing scales with reads.
- **A custom backend (e.g. Spring Boot):** Full control, but it requires hosting, scaling and
  operating a server, plus writing auth and API boilerplate that Supabase provides.

## Consequences

- Authorization is enforced in the database through RLS policies, so every table needs policies
  and those policies need tests.
- Business logic lives in Postgres functions, triggers and Edge Functions instead of an
  application server, which requires solid SQL and migration discipline.
- Expo speeds up development and builds, but features that need custom native code require
  a development build instead of Expo Go.
- The project depends on Supabase as a vendor. This is mitigated by Supabase being open source
  and based on standard Postgres, so data and schema can be moved.
