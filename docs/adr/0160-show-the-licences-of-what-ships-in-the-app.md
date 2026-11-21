# 0160. Show the licences of what ships in the app

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

The app is built with open source libraries, the food values of the Bundeslebensmittelschlüssel,
the exercises of free-exercise-db and the typeface Nunito. Their credits stood in the README
alone (#29). The licences themselves ask for more than that: MIT, ISC, BSD and Apache ask that
the copyright notice and the licence's text come with every copy of the software, and an app
from a store is such a copy; CC BY 4.0 asks to name the source of the food values, their licence
and that they were changed; the Open Font License asks that its text comes with the font.

The project's production dependencies are about 700 packages, but most of them are tools that
build the app and never reach a phone.

## Decision

- **The settings lead to a screen of licences and credits.** It names the food values, the
  exercises and the typeface, each with its source, and lists the libraries by their licence. A
  licence opens its text and the libraries under it, each with the copyright lines of its own
  licence file.
- **Only what the licences ask for:** one row in the settings, no search, no page per library.
- **The libraries listed are those in the app's bundle.** `pnpm licences` bundles the app for
  both platforms with source maps and takes every package a source map names, about a hundred;
  the tools that only build the app are not among them. Each library's licence is the one its
  `package.json` names, and the text and copyright lines come from its own licence file. A
  font's package holds a second file for the font's licence, which is taken too. A package
  without a licence file gets its copyright lines from its repository's licence.
- **A licence's text is shown once.** The wording most of its libraries share is the licence's
  text, without their copyright lines; a library whose text differs keeps its own beside its
  name.
- **The list is a file in the repository,** `src/licences/libraries.json`, written by the script
  and read by the screen. It is written again by hand when a dependency changes; a check in CI
  is left for later (#700).
- **The texts stay in their own language.** Headings and credits are translated; a licence and a
  copyright line are what they are.

## Alternatives considered

- **A page on the website:** nothing in the app, but it does not come with the copy on the
  phone, and does not work offline.
- **Every production dependency:** simple to list from the lockfile, but seven times as long, and
  mostly tools that were never distributed.
- **A list kept by hand:** no script, but it is wrong after the first update.
- **Writing the list at build time:** always current, but every build would bundle the app twice
  more, and the list could not be reviewed.

## Consequences

- After adding, updating or removing a dependency, `pnpm licences` writes the list again, or it
  goes out of date until #700 checks it.
- Native code that a library links from elsewhere, as what React Native builds on, is covered
  only by that library's own entry; its third-party notices are not listed one by one.
- A library whose package ships without a licence file is listed under its licence's text, with
  the copyright lines of its repository's licence, which the script keeps by hand for the few
  there are. The script stops at a new one until its lines are added.
