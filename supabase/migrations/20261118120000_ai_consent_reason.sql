-- Why the user may not use an AI feature, before they consented to it (#290). Added in a migration
-- of its own, as a new value of an enum may be used only once it is committed:
-- 20261118120100_ai_consents.sql uses it.
alter type public.ai_access_reason add value 'consent_required';
