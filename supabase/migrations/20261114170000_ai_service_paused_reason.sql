-- Why the user may not call a model, when the month's AI spend of all users together has reached
-- the provider's limit (#555, ADR 0134). Added in a migration of its own, as a new value of an enum
-- may be used only once it is committed: 20261114170100_ai_spend_limit.sql uses it.
alter type public.ai_access_reason add value 'service_paused';
