-- The prices of Gemini on Vertex AI in the EU, where the hosted project calls it from now on
-- (#549, ADR 0153). Vertex AI charges a tenth more away from its global endpoint than the Gemini
-- Developer API's prices the table held (cloud.google.com/vertex-ai/generative-ai/pricing, the
-- "Non-global" rows, as of 2026-11-19). Calls to the Developer API, which development still makes
-- with test data, are counted at these prices too: a little high, never low.

insert into public.ai_model_prices (model, valid_from, input_usd, cached_input_usd, output_usd)
values
  ('gemini-3.5-flash-lite', '2026-11-19', 0.33, 0.033, 2.75),
  ('gemini-3.8-flash', '2026-11-19', 0.825, 0.0825, 4.125);

-- Gemini 3.8 Flash's price from 2027, not in force yet, so that no call was priced by it.
update public.ai_model_prices
set input_usd = 1.65, cached_input_usd = 0.165, output_usd = 8.25
where model = 'gemini-3.8-flash' and valid_from = '2027-01-01';
