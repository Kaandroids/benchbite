# 0100. Take weight from the health store

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Many users weigh themselves on a smart scale, or log their weight in another app, which writes it to Apple Health or Health Connect. Typing it again into Benchbite is a chore, and gaps in the weight chart weaken what follows from it, such as suggesting new targets when the weight stops moving (#285). Benchbite keeps one weight a day (`weight_entries`), and reads the store already (ADR 0097). Yazio, MacroFactor and Hevy read weight from the stores; none of them imports height or weight in the onboarding, where it is asked once.

## Decision

- **Weights come from the store as the app comes to the front,** while connected, from the last read on and at most 30 days back, with the latest weight of each day.
- **`import_weights()` keeps them,** one a day, with the app or scale that measured them (`weight_entries.source`); of a day given twice, the last counts. Days that are no date, values that are no number or no person has, and days outside the last 60 are left out on their own: 60 is a ceiling above the 30 the app reads. The targets follow when anything changed, as they do after `log_weight()`.
- **Weights are written only by functions:** `log_weight()`, `import_weights()` and `complete_onboarding()`. Users can no longer write `weight_entries` directly, which would leave a day's source as it was.
- **A source's name is kept one way** (`health_source_name()`), for weights and workouts alike: a string, trimmed and cut to 80 characters.
- **A weight entered in Benchbite wins on its day.** Its source is none; the store never changes such a day. `log_weight()` clears the source, so a day the store had filled becomes the user's own once they change it. It writes the source, which users may not, so it now runs with the definer's rights and checks the caller and the day itself.
- **Users already connected are asked once** for the new permission, on Progress; new connections ask for it with the others.
- **Not now:** height, which does not change, body fat, and writing Benchbite's weights to the store.

## Alternatives considered

- **Importing height and weight in the onboarding:** asked once anyway, and another permission screen in the onboarding.
- **The store winning over Benchbite:** a weight the user typed would be replaced behind their back.
- **Every weighing, not one a day:** the table keeps one a day, as the chart and targets use it.

## Consequences

- The weight chart can fill without the user, and shows where a weight came from.
- The privacy policy (#44) and Google Play's Health declaration name weight among the data read.
