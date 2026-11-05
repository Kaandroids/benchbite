# 0086. What the limits on own foods mean

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

ADR 0085 keeps own foods and recipes free and their limits the same for everyone, but its record has
gaps. It names ADR 0018 for the limits, which come from ADR 0036 (foods) and ADR 0038 (recipes). It
rejects a lower free limit because a meal could be refused for a reason the user cannot see, as if
the limits it keeps did not do that. They do: a meal estimate saves a food the library lacks as the
user's own, so at a limit the whole meal is refused, and the photo screen asked the user to check
their connection.

The other apps it names also had no links: [MyFitnessPal](https://support.myfitnesspal.com/hc/en-us/articles/34889191368077-The-difference-between-Free-Premium-and-Premium),
[Cronometer](https://support.cronometer.com/hc/en-us/articles/360028026971) and
[Lifesum](https://lifesum.helpshift.com/hc/en/3-lifesum/faq/36-what-do-i-get-when-i-buy-premium),
as they were read on this date.

## Decision

- **A refused meal says why.** The photo screen names the limit it reached, and how to make room
  where there is a way to.
- **The 1,000 stays, and it is final.** Deleting archives a food, and archived foods still count, so
  at 1,000 foods added in all a user can add no new own food, on any plan, and no meal estimate
  holding a food the library lacks. The limit guards the database, and is looked at again if real
  use comes near it.
- **The case against a lower free limit is how often it would refuse,** not that the refusal would
  be new.

## Alternatives considered

- **Saving the rest of the meal without the new food:** the meal's totals would be wrong without
  the user seeing why, and the estimate is logged whole so that it can be undone whole.
- **Not counting archived foods toward the 1,000:** the limit would no longer bound what a user can
  add and delete, which is what it is there for.
- **Editing ADR 0085:** accepted records are not edited.

## Consequences

- Someone who estimates meals daily can reach the 200 sooner than someone adding foods by hand, and
  learns from the refusal what to do. Daily estimates come with premium, so paying users reach it
  first.
- Nothing yet warns before a limit is reached, and nothing merges near-identical foods the model
  named differently.
- This amends ADR 0085.
