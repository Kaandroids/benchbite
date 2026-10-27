# 0033. Build the food library from the BLS 4.0

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Logging meals needs foods with reliable nutrients and names in English, German and Turkish,
and more languages later. Search has to work as people type, for guests too, without keys or
rate limits. Most users are in Germany and Turkey.

The Bundeslebensmittelschlüssel (BLS), Germany's national nutrient database by the Max
Rubner-Institut, became free in version 4.0 (December 2025) and is published as open data under
CC BY 4.0. It has about 7,140 foods with German and English names and 138 nutrients per 100 g,
but no portion sizes.

## Decision

- **Source:** the BLS 4.0, credited to the Max Rubner-Institut in the README and later in the
  app's licences screen (#29), as CC BY 4.0 requires.
- **A chosen list, not the whole database:** about 300 everyday foods, listed in
  `supabase/data/foods.json` by BLS code with their English, German and Turkish names and their
  portions. The names are rewritten where the BLS name is awkward; the nutrients are always the
  BLS values.
- **Pinned import:** `scripts/import-foods.ts` downloads the release, checks its SHA-256, reads
  the nutrients of the chosen foods and writes a migration, as the exercise library does
  (ADR 0008). It reads the xlsx with Node's `zlib`, so it needs no new dependency.
- **Schema:**
  - `foods` keeps the BLS code as its id, the BLS main group, and kcal, protein, carbs, fat,
    fibre, sugar, saturated fat and salt per 100 g;
  - `food_names` has one row per food and language, with any two-letter code, so a language is
    added with rows, not a schema change, and the app falls back to English;
  - `food_portions` holds portions such as one egg = 60 g in a fixed set of units named in the
    app's translations, with exactly one default per food.
- **Access:** row level security lets everyone read the three tables; there are no write
  policies and write privileges are revoked.

## Alternatives considered

- **USDA FoodData Central:** public domain and detailed, but English only and built around US
  foods.
- **Open Food Facts:** strong for packaged products, but its API allows 10 searches a minute and
  forbids search as you type, and its ODbL licence is share-alike. It stays the candidate for
  barcode scanning (#207), through a cache of our own.
- **Paid APIs such as FatSecret:** wide coverage, but closed data, a dependency on a vendor and
  attribution or fees outside the US.
- **All 7,140 BLS foods:** too many names to translate and check, and search would be full of
  near-identical variants.
- **Translations in a `language in ('de', 'tr')` list, as for exercises:** simpler, but every new
  language would need a migration.

## Consequences

- Search runs in our own database, without keys, rate limits or a third party staying online.
- Foods BLS does not have, such as simit or sucuk, are missing until they get a source of their
  own; `food_source` is an enum so that one can be added.
- Portion sizes are typical European amounts we chose, not BLS data.
- Adding foods means editing `foods.json` and generating a new migration. A food taken out of
  the file is deleted, so tables that reference foods have to survive that, for example by
  keeping their own copy of the values.
