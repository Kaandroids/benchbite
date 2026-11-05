# 0085. Own foods and recipes stay free

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

ADR 0078 makes tracking free and premium the home of intelligence and room to grow, but leaves open
two parts of the food log: foods of one's own and recipes. They could be free, limited on the free
plan, or premium.

A food the library does not have can only be logged as a food of one's own, and meal estimates save
such foods by themselves. Keeping these rows costs next to nothing per use, unlike the AI that
premium pays for.

Other trackers mostly leave them free: MyFitnessPal and Cronometer do, on their own help pages.
Lifesum's help pages list them under premium. What others charge for is rather ready-made content
and conveniences, such as importing a recipe from a web page.

## Decision

- **Own foods and recipes are free,** on every plan and without a limit of the plan's own.
- **The limits stay the same for everyone:** up to 200 foods and 100 recipes at a time, and up to
  1,000 foods and 500 recipes added in all, deleted ones included (ADR 0018). They guard the
  database rather than sell anything, so they stay out of the `plans` table.

## Alternatives considered

- **A lower limit on the free plan:** a meal card or photo could be refused for a food saved by the
  way, for a reason the user cannot see. When premium ends, what is above the limit would have to
  wait, although logged entries name those foods and recipes. It would add little to what premium
  already offers.
- **Recipes as premium, own foods free:** a smaller version of the same, for a feature that costs
  nothing to run and that people use to keep their log accurate.
- **Both as premium:** a free user could not log a food the library lacks, which breaks the promise
  that tracking is free.

## Consequences

- Nothing changes in the database or the app, and there is no new downgrade path.
- Own foods and recipes are not a reason to buy premium. If they should ever earn something, a
  convenience on top of them, such as importing recipes, fits better than a limit.
- Foods saved by meal estimates count toward the same 200, so someone who estimates meals daily
  reaches that limit sooner than someone who adds foods by hand.
