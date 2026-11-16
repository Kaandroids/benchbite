# 0139. Test whole journeys with Maestro on the iOS Simulator

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Jest and React Native Testing Library test the app's screens and logic one at a time, and cover
about nine lines in ten. They do not see what happens between screens: the bug in the Workout tab
fixed in #526 passed every test. Nothing ran the app as a user does, from the first screen through
the tabs, against a real backend (#539).

## Decision

Whole journeys are tested with [Maestro](https://maestro.dev): flows in YAML in `.maestro/` that
tap and type in the development build on the iOS Simulator, by the text and accessibility labels on
screen. They run against the local Supabase stack, the Edge Functions it serves and Metro, with one
command, `pnpm e2e`, before a release and after changes across screens. They are not run in CI.

Each flow starts the app from scratch, signed out, on a simulator of its own, "Benchbite E2E", so
that a run never signs out the one used day to day. The development build opens Metro's bundle
straight away through its `--initialUrl` launch argument, and its developer menu is kept out of the
way through the menu's own settings, given as launch arguments: a deep link to the bundle would
stop at an iOS dialog that Maestro cannot see.

## Alternatives considered

- **Detox**, the other common choice for React Native, runs in the app's process and waits for it
  to be idle, which makes it fast and steady. It needs a build of its own and test code in
  JavaScript with a runner to set up; Maestro works on any build, from outside, with flows a person
  can read without knowing the code.
- **Running the flows in CI.** A run needs a Mac, a built app and the Supabase stack, which needs
  Docker; GitHub's Mac runners have no Docker. Building the app there for every pull request would
  also take longer than the rest of CI together. The flows can move to CI, for example on EAS, if
  running them by hand proves too rare.
- **A release build instead of the development build.** It needs no Metro and starts faster, but
  must be built again for every change to be tested, while the development build takes the
  current code from Metro.

## Consequences

- A change across screens can be checked as a user meets it, with one command.
- Flows find elements by their English text, so a change of wording or language breaks them, as it
  should be seen; they are rewritten with the screens they test.
- Running them needs Maestro and Java on the Mac, and the local stack, the functions and Metro
  running. A run as a guest leaves a guest user in the local database.
- They do not run on pull requests, so a flow can break without anyone noticing until it is run.
