# 0172. Bite proposes recipes and favourites

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Bite logs meals with a card the user adds (ADR 0062) and finds the user's recipes when it does,
but it could not save a dish as a recipe or change the favourites. Users tell Bite how they cook
a dish, or which foods they eat every day, and then have to do the same again in Nutrition, on
several screens. ADR 0058 lets Bite only propose, and the user applies; photos reach the chat
(ADR 0062), and text in a photo must never change data.

## Decision

- **Two proposal kinds,** `recipe` and `favourites` in `coach_proposals`, made with
  `propose_coach_change()` and decided with `decide_coach_proposal()` like the others (ADR 0058
  holds): Apply, Keep and Undo.
- **A recipe** holds a name, its servings and their unit, and 1 to 50 ingredients, each a library
  food or one of the user's own, with grams and the portion picked. It is saved through
  `save_recipe()`, with its checks and limits. What it replaces is the user's recipe of that name
  in use, none when it is proposed: one of that name is refused (`BB068`), and one saved meanwhile
  makes it stale (`BB035`). Undo deletes the recipe again, as deleting one in the app does (ADR
  0038), while it is as saving left it; meals logged with it meanwhile keep it.
- **A change to the favourites** adds and takes out 1 to 10 foods, library foods, foods of one's
  own or recipes. A food to add that is a favourite, or one to take out that is not, is refused
  (`BB069`). What it replaces is which of its foods are favourites, so a food starred or unstarred
  in the app meanwhile makes it stale. Undo stars and unstars them back; a favourite put back counts
  as the newest.
- **Only foods the user can log** (`BB070`): proposals apply as the owner, past the policies that
  keep favourites and ingredients to one's own foods, so `check_coach_foods()` checks them, when
  proposed and when applied.
- **Bite names foods as `search_foods` named them.** The tools `propose_recipe` and
  `propose_favourites` look each name up as the user and take only a food of exactly that name, so
  that a recipe never holds a food the user did not see named; a food Bite cannot find is refused
  with its name, for Bite to search again or ask. A recipe cannot be an ingredient. `search_foods`
  now marks the user's recipes and favourites.
- **Only when the user asks in words, in that message,** as for the food log (ADR 0068): both tools
  refuse a message of photos alone.
- **The cards** show the recipe's ingredients with their grams and calories and what one serving
  weighs and adds, and the favourites each with a filled star to add or an empty one, struck
  through, to take out. They fold into "Saved to your recipes" and "Favourites changed" with Undo.

## Alternatives considered

- **Bite saves the recipe itself, with an Undo:** quicker, but ADR 0058 rules out data Bite writes
  without the user's tap.
- **A recipe from an estimated meal card,** with the model's values for foods the library does
  not have: a recipe's ingredients are foods of the library or of one's own (ADR 0038), so those
  foods would have to be made first, which the user does not see on the card. Bite says what it
  could not find instead.
- **Bite passes the foods' ids:** search_foods gives no ids, and ids the model copies can be wrong
  or another user's; names looked up again as the user can only find the user's own foods.
- **Changing a recipe the user has:** a recipe changed later changes the next entries (ADR 0038),
  and the card would have to show what changes; left for later.

## Consequences

- The user saves a dish or a favourite in one tap from the chat, and nothing changes without it.
- A recipe or a change to the favourites can go stale as soon as the user changes them in
  Nutrition, and then says so.
- Every proposal kind is another branch in `coach_proposal_state()`, `apply_coach_change()`,
  `undo_coach_change()` and `propose_coach_change()`.
