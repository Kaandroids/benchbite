import { assertEquals, assertStringIncludes } from '@std/assert';

import { authTemplates } from './auth_templates.ts';

Deno.test(
  'the Auth templates in supabase/templates are the ones auth_templates.ts writes',
  async () => {
    for (const [file, text] of Object.entries(authTemplates())) {
      const written = await Deno.readTextFile(new URL(`../../templates/${file}`, import.meta.url));
      assertEquals(written, text, `${file} is out of date: run pnpm emails`);
    }
  },
);

Deno.test('each template leaves the code for Auth, in every language', () => {
  for (const text of Object.values(authTemplates())) {
    assertEquals(text.split('{{ .Token }}').length - 1, 3);
    assertStringIncludes(text, '{{ if eq .Data.locale "de" }}');
    assertStringIncludes(text, '{{ else if eq .Data.locale "tr" }}');
  }
});
