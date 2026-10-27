-- Food names are unique within their language (#212), so that search never shows two foods with
-- the same name. They are compared as search compares them (ADR 0035): in lower case, with
-- Turkish İ and ı folded to i. The same name in another language is fine.
create unique index food_names_unique_per_language
  on public.food_names (language, lower(translate(name, 'İı', 'ii')));
